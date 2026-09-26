import { MeshBuilder, TransformNode, Vector3, type Mesh, type Scene } from "@babylonjs/core";
import type { AudioEngine } from "../audio/AudioEngine";
import { boltSlide, doorClose, doorLocked, doorOpen, keyTurn } from "../audio/Sounds";
import { CONFIG } from "../config";
import type { Inventory } from "../player/Inventory";
import type { Materials } from "./Materials";
import { mat } from "./Materials";
import { consolidate } from "./Merge";
import type { OcclusionMap } from "./Occlusion";
import type { DoorDef, StoreLayout } from "./StoreLayout";

interface Leaf {
  pivot: TransformNode;
  panel: Mesh;
  closedYaw: number;
  openYaw: number;
}

export class Door {
  /** 0 = fermée, 1 = ouverte ; animée vers `target`. */
  t = 0;
  target = 0;
  locked: boolean;
  /** Verrou ajouté de l'extérieur (chambre froide, 01:10) : aucune clé du trousseau ne l'ouvre. */
  bolted = false;
  /** Secondes pendant lesquelles le joueur n'a pas regardé cette porte (règle 5). */
  unseen = 0;
  bolt: Mesh | null = null;

  constructor(
    readonly def: DoorDef,
    readonly leaves: Leaf[],
  ) {
    this.locked = def.key !== null && !def.startsOpen;
    this.t = this.target = def.startsOpen ? 1 : 0;
  }

  get isOpen(): boolean {
    return this.target === 1;
  }

  get heavy(): boolean {
    return this.def.kind === "emergency" || this.def.id === "froide";
  }

  /** Normale au mur, du côté où la porte s'ouvre. */
  get normal(): { x: number; z: number } {
    return this.def.wallAxis === "x" ? { x: 0, z: this.def.openTo } : { x: this.def.openTo, z: 0 };
  }

  get center(): Vector3 {
    return new Vector3(this.def.x, 1.1, this.def.z);
  }
}

export type DoorResult = { ok: true; message?: string } | { ok: false; message: string };

/**
 * Les portes : animation, clés, verrou de la chambre froide, et la règle 5 :
 * une sortie de secours ouverte se referme et se reverrouille dès qu'on ne la surveille plus.
 */
export class DoorSystem {
  readonly doors = new Map<string, Door>();
  private readonly byPanel = new Map<number, Door>();

  constructor(
    scene: Scene,
    mats: Materials,
    layout: StoreLayout,
    private readonly occ: OcclusionMap,
    private readonly audio: AudioEngine,
  ) {
    const wood = mat(scene, "porte-bois", "#8b8f94", { specular: 0.2 });
    const steel = mat(scene, "porte-inox", "#dfe4e8", { specular: 0.5 });
    for (const def of layout.doors) {
      if (def.kind === "entrance") continue;
      const material = def.kind === "emergency" ? mats.emergencyDoor : def.id === "froide" ? steel : wood;
      const leaves: Leaf[] = [];
      const alongX = def.wallAxis === "x";
      const axis = alongX ? { x: 1, z: 0 } : { x: 0, z: 1 };
      const n = alongX ? { x: 0, z: def.openTo } : { x: def.openTo, z: 0 };
      const hinges = def.double ? [-1, 1] : [-1];
      const leafLength = (def.width / hinges.length) - 0.03;
      for (const side of hinges) {
        const hx = def.x + axis.x * side * (def.width / 2);
        const hz = def.z + axis.z * side * (def.width / 2);
        const pivot = new TransformNode(`gond-${def.id}`, scene);
        pivot.position.set(hx, 0, hz);
        const panel = MeshBuilder.CreateBox(`porte-${def.id}`, { width: leafLength, height: def.height - 0.02, depth: def.kind === "emergency" || def.id === "froide" ? 0.09 : 0.05 }, scene);
        panel.parent = pivot;
        panel.position.set(leafLength / 2 + 0.015, def.height / 2, 0);
        panel.material = material;
        panel.checkCollisions = true;
        // Le panneau va du gond vers le centre de l'ouverture (fermée) ou le long de la normale (ouverte).
        const closedYaw = yawFor(-axis.x * side, -axis.z * side);
        const openYaw = yawFor(n.x, n.z);
        const leaf: Leaf = { pivot, panel, closedYaw, openYaw };
        leaves.push(leaf);
        this.decorate(scene, mats, def, panel, leafLength);
      }
      const door = new Door(def, leaves);
      if (def.id === "froide") door.bolt = this.buildBolt(scene, mats, leaves[0], leafLength);
      this.doors.set(def.id, door);
      for (const l of leaves) this.byPanel.set(l.panel.uniqueId, door);
      this.applyPose(door);
    }
  }

  get(id: string): Door {
    return this.doors.get(id)!;
  }

  doorOfMesh(uniqueId: number): Door | null {
    return this.byPanel.get(uniqueId) ?? null;
  }

  get panels(): Mesh[] {
    return [...this.doors.values()].flatMap((d) => d.leaves.map((l) => l.panel));
  }

  /** Texte du prompt d'interaction pour cette porte. */
  prompt(door: Door, inventory: Inventory): string {
    if (door.isOpen) return "[E] Fermer";
    if (door.bolted) return "[E] Examiner le verrou";
    if (door.locked) return door.def.key && inventory.has(door.def.key) ? "[E] Déverrouiller" : "[E] Fermée à clé";
    return door.def.kind === "emergency" ? "[E] Ouvrir la sortie de secours" : "[E] Ouvrir";
  }

  /** Le joueur appuie sur E devant la porte. */
  interact(door: Door, inventory: Inventory, player: { x: number; z: number }): DoorResult {
    if (door.isOpen) {
      if (this.inDoorway(door, player)) return { ok: false, message: "T'es en plein dans l'encadrement." };
      this.setOpen(door, false);
      return { ok: true };
    }
    if (door.bolted) {
      doorLocked(this.audio, door.center);
      return { ok: false, message: "Un verrou vissé côté réserve. Il existait pas hier. Aucune clé du trousseau ne rentre." };
    }
    if (door.locked) {
      if (!door.def.key || !inventory.has(door.def.key)) {
        doorLocked(this.audio, door.center);
        return { ok: false, message: "Fermée à clé." };
      }
      keyTurn(this.audio, door.center);
      door.locked = false;
    }
    if (this.inSwing(door, player)) return { ok: false, message: "Recule, elle s'ouvre vers toi." };
    this.setOpen(door, true);
    return { ok: true };
  }

  setOpen(door: Door, open: boolean, opts: { instant?: boolean; lock?: boolean; silent?: boolean } = {}): void {
    if (open === door.isOpen && !opts.instant) return;
    door.target = open ? 1 : 0;
    door.unseen = 0;
    if (opts.instant) door.t = door.target;
    if (!open && opts.lock) door.locked = true;
    if (!opts.silent) {
      if (open) doorOpen(this.audio, door.center, door.heavy);
      else setTimeout(() => doorClose(this.audio, door.center, door.heavy), opts.instant ? 0 : 380);
    }
    this.applyPose(door);
  }

  /** Chambre froide, 01:10 : la porte claque et un verrou apparaît de l'extérieur. */
  slamAndBolt(door: Door): void {
    door.target = 0;
    door.t = Math.min(door.t, 0.35);
    door.bolted = true;
    door.locked = true;
    if (door.bolt) door.bolt.setEnabled(true);
    doorClose(this.audio, door.center, true, 1.6);
    setTimeout(() => boltSlide(this.audio, door.center), 700);
    this.applyPose(door);
  }

  /** Nouvelle nuit : chaque porte reprend son état de départ. */
  reset(): void {
    for (const door of this.doors.values()) {
      door.bolted = false;
      door.locked = door.def.key !== null && !door.def.startsOpen;
      door.t = door.target = door.def.startsOpen ? 1 : 0;
      door.unseen = 0;
      door.bolt?.setEnabled(false);
      this.applyPose(door);
    }
  }

  /**
   * Animation, règle 5 et sortie par une porte de secours.
   * @returns la porte de secours que le joueur vient de franchir (vers l'extérieur), ou null.
   */
  update(dt: number, eye: Vector3, forward: Vector3, halfFov: number, player: { x: number; z: number }): Door | null {
    let crossed: Door | null = null;
    for (const door of this.doors.values()) {
      if (door.t !== door.target) {
        const speed = door.heavy ? 1.7 : 2.4;
        door.t = door.target > door.t ? Math.min(door.target, door.t + dt * speed) : Math.max(door.target, door.t - dt * speed * (door.bolted ? 3 : 1));
        this.applyPose(door);
      }
      if (door.def.kind !== "emergency" || !door.isOpen) continue;

      // Règle 5 : une sortie de secours qu'on ne surveille pas se referme et se reverrouille.
      const c = door.center;
      const to = c.subtract(eye);
      const dist = to.length();
      const inView = Vector3.Dot(to.scaleInPlace(1 / Math.max(dist, 1e-3)), forward) > Math.cos(halfFov);
      const seen = inView && !this.occ.blocked(eye, c);
      door.unseen = seen ? 0 : door.unseen + dt;
      if (door.unseen >= CONFIG.doors.emergencyRelockSeconds && !this.inDoorway(door, player)) {
        this.setOpen(door, false, { lock: true, silent: true });
        // Le bruit vient de loin : une clenche qui retombe.
        setTimeout(() => doorClose(this.audio, door.center, true, 0.7), 150);
      }

      // Le joueur est passé de l'autre côté.
      const n = door.normal;
      const out = (player.x - door.def.x) * n.x + (player.z - door.def.z) * n.z;
      const lateral = Math.abs((player.x - door.def.x) * n.z + (player.z - door.def.z) * n.x);
      if (out > 0.45 && lateral < door.def.width / 2 + 1.2) crossed = door;
    }
    return crossed;
  }

  private inDoorway(door: Door, p: { x: number; z: number }): boolean {
    const n = door.normal;
    const along = Math.abs((p.x - door.def.x) * n.x + (p.z - door.def.z) * n.z);
    const lateral = Math.abs((p.x - door.def.x) * n.z + (p.z - door.def.z) * n.x);
    return along < 0.55 && lateral < door.def.width / 2 + 0.2;
  }

  /** Le joueur est-il dans la zone que balaie la porte en s'ouvrant ? */
  private inSwing(door: Door, p: { x: number; z: number }): boolean {
    const n = door.normal;
    const along = (p.x - door.def.x) * n.x + (p.z - door.def.z) * n.z;
    const lateral = Math.abs((p.x - door.def.x) * n.z + (p.z - door.def.z) * n.x);
    return along > -0.2 && along < door.def.width + 0.25 && lateral < door.def.width / 2 + 0.3;
  }

  private applyPose(door: Door): void {
    const k = door.t * door.t * (3 - 2 * door.t);
    for (const l of door.leaves) l.pivot.rotation.y = l.closedYaw + angleDiff(l.closedYaw, l.openYaw) * k;
    // Porte fermée (ou presque) : elle bloque la vue et le passage du client.
    if (door.t < 0.25) {
      const d = door.def;
      const alongX = d.wallAxis === "x";
      this.occ.setDynamic(`porte-${d.id}`, {
        minX: alongX ? d.x - d.width / 2 : d.x - 0.08,
        maxX: alongX ? d.x + d.width / 2 : d.x + 0.08,
        minY: 0,
        maxY: d.height,
        minZ: alongX ? d.z - 0.08 : d.z - d.width / 2,
        maxZ: alongX ? d.z + 0.08 : d.z + d.width / 2,
      });
    } else this.occ.setDynamic(`porte-${door.def.id}`, null);
  }

  private decorate(scene: Scene, mats: Materials, def: DoorDef, panel: Mesh, length: number): void {
    const handleLocal = (x: number, y: number, depth: number, w: number) => {
      for (const s of [-1, 1]) {
        const h = MeshBuilder.CreateBox("poignee", { width: w, height: 0.04, depth: 0.05 }, scene);
        h.parent = panel;
        h.position.set(x, y, s * (depth / 2 + 0.03));
        h.material = mats.darkPlastic;
        h.isPickable = false;
      }
    };
    if (def.kind === "emergency") handleLocal(0, 1.0 - def.height / 2, 0.09, length * 0.8);
    else handleLocal(length / 2 - 0.12, 1.0 - def.height / 2, def.id === "froide" ? 0.09 : 0.05, 0.14);
    // Les deux poignées en un seul mesh (le panneau lui-même reste à part : il est interactif).
    panel.metadata = { keep: true };
    consolidate(panel);
  }

  /** Le verrou de la chambre froide : une grosse targette neuve, vissée côté réserve. */
  private buildBolt(scene: Scene, mats: Materials, leaf: Leaf, length: number): Mesh {
    const bolt = MeshBuilder.CreateBox("verrou-froide", { width: 0.22, height: 0.07, depth: 0.05 }, scene);
    bolt.parent = leaf.panel;
    // Le z local du panneau fermé pointe vers l'intérieur de la chambre froide : le verrou est côté -z (réserve).
    bolt.position.set(length / 2 - 0.2, 1.25 - leaf.panel.position.y, -0.07);
    bolt.material = mats.shelfMetal;
    bolt.isPickable = false;
    bolt.setEnabled(false);
    return bolt;
  }
}

/** Lacet (rotation autour de y) qui oriente l'axe local +x dans la direction (dx, dz). */
function yawFor(dx: number, dz: number): number {
  return Math.atan2(-dz, dx);
}

function angleDiff(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
