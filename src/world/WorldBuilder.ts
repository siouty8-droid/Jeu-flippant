import { Color3, Mesh, MeshBuilder, Scene, StandardMaterial, Texture, TransformNode, Vector3 } from "../babylon";
import { Rng } from "../core/Rng";
import { drawPlan } from "../ui/PlanRenderer";
import { createMaterials, mat, textTexture, type Materials } from "./Materials";
import { consolidate } from "./Merge";
import { ModuleFactory, type ModuleInstance } from "./ModuleFactory";
import { buildCart } from "./Props";
import { MODULES, STORE, wallPieces, type StoreLayout, type Wall, type WallMaterial } from "./StoreLayout";

/** Un néon au plafond. Le NeonSystem (règle 3) pilotera sa couleur ; ici on le pose. */
export interface NeonFixture {
  tube: Mesh;
  /** Points d'où une vraie PointLight peut éclairer, le long du tube. */
  anchors: Vector3[];
  zoneId: string;
  cold: boolean;
  /** Le tube au sol (projection xz), pour mesurer la distance à une menace. */
  seg: { x0: number; z0: number; x1: number; z1: number };
}

export interface World {
  mats: Materials;
  modules: Map<number, ModuleInstance>;
  neons: NeonFixture[];
  /** Écrans du poste de sécurité (règle 2, étape 4). */
  monitors: Mesh[];
  /** Le plan d'évacuation mural (interactif : photo). */
  planPanel: Mesh;
  /** Place chaque module dans le slot que lui donne `assignment` (par défaut layout.assignment). */
  placeModules(assignment?: readonly number[]): void;
}

const PARKED = new Vector3(0, -50, 0);

function tile(material: StandardMaterial, u: number, v: number): void {
  const tex = material.diffuseTexture as Texture;
  tex.uScale = u;
  tex.vScale = v;
}

export function buildWorld(scene: Scene, layout: StoreLayout, rng: Rng): World {
  const mats = createMaterials(scene);
  const b = new Builder(scene, mats, layout);

  b.floorsAndCeiling();
  for (const wall of layout.walls) b.wall(wall);
  b.emergencyDoors();
  b.roomDoorFrames();
  b.entrance();
  b.checkouts();
  b.securityPost();
  b.backRooms(rng.fork("arriere"));
  b.outside();
  const planPanel = b.evacuationPlan();
  const neons = b.neons();

  const factory = new ModuleFactory(scene, mats, rng.fork("modules"));
  const modules = new Map<number, ModuleInstance>();
  for (const def of MODULES) modules.set(def.id, factory.build(def));

  const placeModules = (assignment: readonly number[] = layout.assignment) => {
    const placed = new Set<number>();
    assignment.forEach((id, slotIndex) => {
      const slot = layout.slots[slotIndex];
      const inst = modules.get(id)!;
      inst.root.position.set(slot.cx, 0, slot.cz);
      inst.root.setEnabled(true);
      placed.add(id);
    });
    for (const [id, inst] of modules) {
      if (placed.has(id)) continue;
      inst.root.position.copyFrom(PARKED);
      inst.root.setEnabled(false);
    }
  };
  placeModules();

  return { mats, modules, neons, monitors: b.monitors, planPanel, placeModules };
}

class Builder {
  readonly monitors: Mesh[] = [];
  private readonly staticParts = new Map<StandardMaterial, { meshes: Mesh[] }>();

  constructor(
    private readonly scene: Scene,
    private readonly mats: Materials,
    private readonly layout: StoreLayout,
  ) {}

  private box(mat: StandardMaterial, w: number, h: number, d: number, x: number, y: number, z: number, collide = true): Mesh {
    const m = MeshBuilder.CreateBox("statique", { width: w, height: h, depth: d }, this.scene);
    m.position.set(x, y, z);
    m.material = mat;
    m.checkCollisions = collide;
    return m;
  }

  /** Boîte statique fusionnée plus tard avec toutes celles du même matériau (moins de draw calls). */
  private staticBox(mat: StandardMaterial, w: number, h: number, d: number, x: number, y: number, z: number, collide = true): void {
    const m = MeshBuilder.CreateBox("statique", { width: w, height: h, depth: d }, this.scene);
    m.position.set(x, y, z);
    let entry = this.staticParts.get(mat);
    if (!entry) {
      entry = { meshes: [] };
      this.staticParts.set(mat, entry);
    }
    entry.meshes.push(m);
    m.checkCollisions = collide;
  }

  floorsAndCeiling(): void {
    const W = STORE.width;
    const store = MeshBuilder.CreateGround("sol-magasin", { width: W, height: STORE.salesDepth }, this.scene);
    store.position.set(W / 2, 0, STORE.salesDepth / 2);
    tile(this.mats.floor, W / 2, STORE.salesDepth / 2);
    store.material = this.mats.floor;

    const backDepth = STORE.depth - STORE.salesDepth;
    const back = MeshBuilder.CreateGround("sol-reserve", { width: W, height: backDepth }, this.scene);
    back.position.set(W / 2, 0.001, STORE.salesDepth + backDepth / 2);
    tile(this.mats.floorBack, W / 4, backDepth / 4);
    back.material = this.mats.floorBack;

    const ceiling = MeshBuilder.CreateGround("plafond", { width: W, height: STORE.depth }, this.scene);
    ceiling.position.set(W / 2, STORE.height, STORE.depth / 2);
    ceiling.rotation.x = Math.PI;
    tile(this.mats.ceiling, W / 0.6, STORE.depth / 0.6);
    ceiling.material = this.mats.ceiling;
  }

  wall(wall: Wall): void {
    const matFor: Record<WallMaterial, StandardMaterial> = {
      store: this.mats.wallStore,
      back: this.mats.wallBack,
      cold: this.mats.wallCold,
      office: this.mats.wallOffice,
    };
    for (const p of wallPieces(wall)) {
      const w = p.maxX - p.minX;
      const h = p.maxY - p.minY;
      const d = p.maxZ - p.minZ;
      const x = (p.minX + p.maxX) / 2;
      const y = (p.minY + p.maxY) / 2;
      const z = (p.minZ + p.maxZ) / 2;
      if (p.glass) {
        const alongX = w > d;
        const g = this.box(this.mats.glass, alongX ? w : 0.03, h, alongX ? 0.03 : d, x, y, z, true);
        g.isPickable = false;
      } else {
        this.staticBox(matFor[wall.material], w, h, d, x, y, z, true);
      }
    }
  }


  emergencyDoors(): void {
    const signTex = textTexture(this.scene, "tex-sortie-secours", 512, 128, (ctx, w, h) => {
      ctx.fillStyle = "#1fae45";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 54px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🏃  SORTIE DE SECOURS", w / 2, h / 2 + 3);
    });
    const signMat = mat(this.scene, "panneau-secours", "#000000");
    signMat.emissiveTexture = signTex;
    signMat.disableLighting = true;

    for (const d of this.layout.doors.filter((door) => door.kind === "emergency")) {
      const alongX = d.wallAxis === "x";
      // Normale vers l'intérieur du bâtiment (l'opposé du sens d'ouverture).
      const inward = alongX ? new Vector3(0, 0, -d.openTo) : new Vector3(-d.openTo, 0, 0);
      const sign = MeshBuilder.CreatePlane(`panneau-${d.id}`, { width: 1.0, height: 0.25 }, this.scene);
      const sp = new Vector3(d.x, d.height + 0.3, d.z).addInPlace(inward.scale(0.12));
      sign.position.copyFrom(sp);
      // Le plan est visible depuis -z local : on l'oriente vers l'intérieur.
      sign.rotation.y = Math.atan2(-inward.x, -inward.z);
      sign.material = signMat;
      sign.isPickable = false;
    }
  }

  roomDoorFrames(): void {
    for (const d of this.layout.doors.filter((door) => door.kind === "room" || door.kind === "emergency")) {
      const alongX = d.wallAxis === "x";
      const t = STORE.wallThickness + 0.04;
      for (const s of [-1, 1]) {
        const off = s * (d.width / 2 + 0.03);
        this.staticBox(this.mats.darkPlastic, alongX ? 0.06 : t, d.height, alongX ? t : 0.06, alongX ? d.x + off : d.x, d.height / 2, alongX ? d.z : d.z + off, true);
      }
      this.staticBox(this.mats.darkPlastic, alongX ? d.width + 0.12 : t, 0.08, alongX ? t : d.width + 0.12, d.x, d.height + 0.04, d.z, false);
    }
  }

  entrance(): void {
    const e = this.layout.doors.find((d) => d.kind === "entrance")!;
    // Portes automatiques ouvertes, rangées sur les côtés.
    for (const s of [-1, 1]) {
      const g = this.box(this.mats.glass, e.width / 2, e.height, 0.04, e.x + s * (e.width / 2 + e.width / 4 - 0.1), e.height / 2, 0.15, false);
      g.isPickable = false;
      this.staticBox(this.mats.darkPlastic, 0.05, e.height, 0.06, e.x + s * (e.width / 2 + e.width / 2 - 0.1), e.height / 2, 0.15, false);
    }
    this.staticBox(this.mats.darkPlastic, e.width + 0.2, 0.25, 0.3, e.x, e.height + 0.12, 0, false);
    // Tant qu'il n'y a pas de fin, on ne sort pas : mur invisible dans l'ouverture.
    const blocker = this.box(this.mats.glass, e.width, e.height, 0.3, e.x, e.height / 2, -0.3, true);
    blocker.isVisible = false;
    blocker.name = "blocage-entree";

    // Portiques antivol.
    for (const x of [16.3, 19.7]) {
      this.staticBox(this.mats.shelfMetal, 0.12, 1.6, 0.5, x, 0.8, 1.2, true);
    }
    // Caddies rangés près de l'entrée (fusionnés : 2 draw calls au lieu de 12).
    const parked = new TransformNode("caddies-ranges", this.scene);
    for (let i = 0; i < 4; i++) {
      const cart = buildCart(this.scene, this.mats, `caddie-range-${i}`);
      cart.parent = parked;
      cart.position.set(10.5, 0, 1.4 + i * 0.28);
      cart.rotation.y = Math.PI;
    }
    consolidate(parked);
    // Butée des caddies.
    this.staticBox(this.mats.shelfMetal, 0.7, 0.05, 1.4, 10.5, 1.0, 1.8, true);
  }

  checkouts(): void {
    for (let i = 0; i < 3; i++) {
      const x = 23 + i * 4;
      this.staticBox(this.mats.fridgeBody, 0.9, 0.85, 3.2, x, 0.425, 5, true);
      this.staticBox(this.mats.counterTop, 0.7, 0.03, 2.4, x, 0.865, 5.35, false);
      this.staticBox(this.mats.darkPlastic, 0.45, 0.3, 0.4, x - 0.2, 1.0, 3.8, false);
      // Siège de caissier·ère.
      this.staticBox(this.mats.darkPlastic, 0.45, 0.5, 0.45, x + 1.0, 0.25, 4.0, true);
      // Mât avec numéro de caisse.
      this.staticBox(this.mats.shelfMetal, 0.05, 1.6, 0.05, x + 0.4, 1.7, 3.5, false);
      const lamp = MeshBuilder.CreatePlane(`numero-caisse-${i + 1}`, { width: 0.4, height: 0.4 }, this.scene);
      lamp.position.set(x + 0.4, 2.6, 3.5);
      lamp.rotation.y = Math.PI;
      const m = mat(this.scene, `numero-caisse-${i + 1}`, "#000000");
      m.emissiveTexture = textTexture(this.scene, `tex-caisse-${i + 1}`, 128, 128, (ctx, w, h) => {
        ctx.fillStyle = i === 0 ? "#2a9d3a" : "#3a3a3a";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 96px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(i + 1), w / 2, h / 2 + 6);
      });
      m.disableLighting = true;
      m.backFaceCulling = false;
      lamp.material = m;
    }
  }

  securityPost(): void {
    // Bureau contre le mur ouest, écrans face à la pièce.
    this.staticBox(this.mats.shelfWood, 0.9, 0.05, 4.2, 0.55, 0.75, 3, true);
    this.staticBox(this.mats.darkPlastic, 0.8, 0.72, 0.05, 0.55, 0.36, 0.95, true);
    this.staticBox(this.mats.darkPlastic, 0.8, 0.72, 0.05, 0.55, 0.36, 5.05, true);
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 3; i++) {
        const z = 1.7 + i * 1.3;
        const y = 1.12 + row * 0.62;
        this.staticBox(this.mats.darkPlastic, 0.3, 0.55, 0.85, 0.35, y, z, false);
        const screen = MeshBuilder.CreatePlane(`ecran-surveillance-${row * 3 + i}`, { width: 0.76, height: 0.47 }, this.scene);
        screen.position.set(0.51, y, z);
        screen.rotation.y = -Math.PI / 2;
        screen.material = this.mats.monitorScreen;
        this.monitors.push(screen);
      }
    }
    // Chaise, casier, tableau de liège.
    this.staticBox(this.mats.darkPlastic, 0.5, 0.5, 0.5, 1.6, 0.25, 3, true);
    this.staticBox(this.mats.darkPlastic, 0.06, 0.6, 0.5, 1.85, 0.8, 3, false);
    this.staticBox(this.mats.shelfMetal, 0.5, 1.9, 0.9, 5.6, 0.95, 0.7, true);
    this.staticBox(this.mats.cardboard, 0.03, 0.8, 1.2, 0.12, 2.3, 3, false);
  }

  backRooms(rng: Rng): void {
    // Réserve : racks bleus le long du mur du fond, palettes de cartons.
    for (let x = 16; x <= 27; x += 2.8) {
      for (const y of [0.1, 1.2, 2.3]) this.staticBox(this.mats.metalRack, 2.6, 0.06, 1.1, x + 1.3, y, 58.2, false);
      for (const dx of [0, 2.6]) this.staticBox(this.mats.metalRack, 0.08, 3.0, 1.1, x + dx, 1.5, 58.2, true);
      for (const y of [0.13, 1.23, 2.33]) {
        let cx = x + 0.1;
        while (cx < x + 2.4) {
          const w = rng.range(0.35, 0.7);
          const h = rng.range(0.3, 0.8);
          this.staticBox(this.mats.cardboard, w - 0.03, h, rng.range(0.6, 0.95), cx + w / 2, y + h / 2, 58.2, false);
          cx += w;
        }
      }
    }
    // Rack plein de la collision (sinon on passe entre les montants).
    const rackBlock = this.box(this.mats.glass, 12, 3, 1.1, 22, 1.5, 58.2, true);
    rackBlock.isVisible = false;

    for (const [px, pz] of [[18, 51.5], [26.5, 53], [32.5, 51.2], [33, 56]] as const) {
      this.staticBox(this.mats.pallet, 1.2, 0.15, 1.0, px, 0.075, pz, true);
      const layers = rng.int(2, 4);
      for (let l = 0; l < layers; l++) {
        this.staticBox(this.mats.cardboard, 1.15, 0.42, 0.95, px, 0.15 + 0.21 + l * 0.43, pz, true);
      }
    }
    // Transpalette.
    this.staticBox(this.mats.metalRack, 0.55, 0.08, 1.2, 29.5, 0.08, 51.5, true);
    this.staticBox(this.mats.darkPlastic, 0.06, 1.1, 0.06, 29.5, 0.6, 50.9, false);

    // Chambre froide : étagères inox le long des murs.
    for (const x of [7.7, 13.3]) {
      for (const y of [0.3, 0.9, 1.5, 2.1]) this.staticBox(this.mats.fridgeBody, 0.9, 0.04, 8.5, x, y, 54.5, false);
      for (const z of [50.3, 54.5, 58.7]) for (const dx of [-0.42, 0.42]) this.staticBox(this.mats.shelfMetal, 0.04, 2.12, 0.04, x + dx, 1.06, z, false);
      this.box(this.mats.glass, 0.9, 2.3, 8.5, x, 1.15, 54.5, true).isVisible = false;
      for (const y of [0.32, 0.92, 1.52]) {
        let z = 50.5;
        while (z < 58.5) {
          const d = rng.range(0.35, 0.6);
          const h = rng.range(0.2, 0.45);
          this.staticBox(this.mats.cardboard, 0.6, h, d - 0.04, x, y + h / 2, z + d / 2, false);
          z += d;
        }
      }
    }
    // Local technique : armoires électriques, ballon d'eau chaude, table.
    for (let z = 50; z < 57; z += 1.2) this.staticBox(this.mats.electricalCabinet, 0.5, 2.0, 1.1, 0.4, 1.0, z + 0.55, true);
    const tank = MeshBuilder.CreateCylinder("ballon", { diameter: 0.9, height: 1.9 }, this.scene);
    tank.position.set(6.2, 0.95, 58.2);
    tank.material = this.mats.fridgeBody;
    tank.checkCollisions = true;
    this.staticBox(this.mats.shelfWood, 1.4, 0.05, 0.8, 4.2, 0.78, 57.9, true);
    for (const [lx, lz] of [[3.6, 57.6], [4.8, 57.6], [3.6, 58.2], [4.8, 58.2]] as const) {
      this.staticBox(this.mats.darkPlastic, 0.05, 0.76, 0.05, lx, 0.38, lz, false);
    }
    for (const y of [3.6, 3.85]) {
      const pipe = MeshBuilder.CreateCylinder("tuyau", { diameter: 0.12, height: 10 }, this.scene);
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(y === 3.6 ? 1.5 : 2.2, y, 54);
      pipe.material = this.mats.shelfMetal;
    }
  }

  outside(): void {
    const ground = MeshBuilder.CreateGround("parking", { width: 90, height: 40 }, this.scene);
    ground.position.set(18, -0.02, -20);
    ground.material = this.mats.asphalt;
    for (let x = 4; x < 36; x += 3) this.staticBox(this.mats.wallStore, 0.1, 0.01, 4.5, x, 0.0, -9, false);
    for (const x of [2, 34]) {
      this.staticBox(this.mats.darkPlastic, 0.15, 6, 0.15, x, 3, -14, false);
      const head = MeshBuilder.CreateBox("tete-lampadaire", { width: 0.6, height: 0.12, depth: 0.3 }, this.scene);
      head.position.set(x, 6, -14);
      head.material = this.mats.streetLamp;
    }
  }

  evacuationPlan(): Mesh {
    const panel = MeshBuilder.CreatePlane("plan-evacuation", { width: 1.1, height: 1.6 }, this.scene);
    panel.position.set(15.25, 1.55, STORE.wallThickness / 2 + 0.035);
    panel.rotation.y = Math.PI;
    const m = mat(this.scene, "plan-evacuation", "#ffffff", { specular: 0.25 });
    m.diffuseTexture = textTexture(this.scene, "tex-plan-evacuation", 704, 1024, (ctx, w, h) =>
      drawPlan(ctx, w, h, this.layout, {
        assignment: this.layout.initialAssignment,
        theme: "poster",
        title: "PLAN D'ÉVACUATION",
        youAreHere: { x: 15.25, z: 0.6 },
      }),
    );
    m.emissiveColor = new Color3(0.12, 0.12, 0.12);
    panel.material = m;
    this.staticBox(this.mats.darkPlastic, 1.18, 1.68, 0.04, 15.25, 1.55, STORE.wallThickness / 2 + 0.01, false);
    return panel;
  }

  /** Pose tous les néons et renvoie leurs positions. À appeler en dernier : il fusionne aussi le statique. */
  neons(): NeonFixture[] {
    const fixtures: NeonFixture[] = [];
    const y = STORE.height - 0.22;
    const tube = (x: number, z: number, length: number, alongZ: boolean, zoneId: string, cold = false) => {
      const w = alongZ ? 0.09 : length;
      const d = alongZ ? length : 0.09;
      this.staticBox(this.mats.neonHousing, w + 0.16, 0.08, d + 0.16, x, y + 0.08, z, false);
      const t = MeshBuilder.CreateBox(`neon-${zoneId}-${fixtures.length}`, { width: w, height: 0.05, depth: d }, this.scene);
      t.position.set(x, y, z);
      t.material = cold ? this.mats.coldLight : this.mats.neonTube;
      t.isPickable = false;
      const anchors: Vector3[] = [];
      const n = Math.max(1, Math.round(length / 5));
      for (let i = 0; i < n; i++) {
        const f = (i + 0.5) / n - 0.5;
        anchors.push(new Vector3(alongZ ? x : x + f * length, y - 0.3, alongZ ? z + f * length : z));
      }
      const half = length / 2;
      const seg = alongZ ? { x0: x, z0: z - half, x1: x, z1: z + half } : { x0: x - half, z0: z, x1: x + half, z1: z };
      fixtures.push({ tube: t, anchors, zoneId, cold, seg });
    };

    // Au-dessus de chaque allée de rayon.
    for (const s of this.layout.slots) tube(s.cx, s.cz, 7.5, true, `slot-${s.index}`);
    // Allées longitudinales entre les colonnes.
    for (const x of [2, 12.5, 23.5, 34]) for (const z of [16.5, 28.5, 40.5]) tube(x, z, 6, true, "allee");
    // Allées transversales.
    for (const z of [10.5, 22.5, 34.5, 47]) for (const x of [7, 18, 29]) tube(x, z, 5, false, "allee");
    // Entrée / caisses.
    for (const x of [10, 18, 27, 33]) tube(x, 4.5, 4, false, "entree");
    tube(3, 3, 2.5, true, "securite");
    // Arrière-boutique.
    tube(3.5, 54, 4, true, "technique");
    tube(10.5, 54, 5, true, "froide", true);
    for (const x of [19, 26, 32]) tube(x, 54, 4, true, "reserve");

    this.mergeStatic();
    return fixtures;
  }

  private mergeStatic(): void {
    for (const [material, entry] of this.staticParts) {
      const colliders = entry.meshes.filter((m) => m.checkCollisions);
      const decor = entry.meshes.filter((m) => !m.checkCollisions);
      for (const [group, collide] of [[colliders, true], [decor, false]] as const) {
        if (group.length === 0) continue;
        const merged = Mesh.MergeMeshes(group as Mesh[], true, true);
        if (!merged) continue;
        merged.name = `statique-${material.name}${collide ? "" : "-deco"}`;
        merged.material = material;
        merged.checkCollisions = collide;
        merged.freezeWorldMatrix();
      }
    }
    this.staticParts.clear();
  }
}

