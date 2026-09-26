import { MeshBuilder, type Scene } from "@babylonjs/core";
import type { Rng } from "../core/Rng";
import { Figure } from "../world/Figure";
import type { NavGraph } from "../world/NavGraph";

export interface Waypoint {
  x: number;
  z: number;
  /** Appelé en atteignant ce point (ouvrir une porte…). */
  onReach?: () => void;
}

/** Un personnage qui suit une liste de points. */
export class Walker {
  x = 0;
  z = 0;
  yaw = 0;
  speed = 0;
  sitting = false;
  path: Waypoint[] = [];

  constructor(
    readonly id: string,
    readonly figure: Figure,
    private readonly walkSpeed: number,
  ) {}

  get active(): boolean {
    return this.figure.enabled;
  }

  place(x: number, z: number, yaw: number): void {
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    this.path = [];
    this.speed = 0;
  }

  get arrived(): boolean {
    return this.path.length === 0;
  }

  update(dt: number): void {
    if (!this.active) return;
    let step = this.walkSpeed * dt;
    this.speed = 0;
    while (step > 0 && this.path.length > 0) {
      const target = this.path[0];
      const dx = target.x - this.x;
      const dz = target.z - this.z;
      const len = Math.hypot(dx, dz);
      if (len > 1e-3) {
        const desired = Math.atan2(dx, dz);
        let diff = desired - this.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.yaw += Math.max(-dt * 6, Math.min(dt * 6, diff));
      }
      this.speed = this.walkSpeed;
      if (len <= step) {
        this.x = target.x;
        this.z = target.z;
        this.path.shift();
        target.onReach?.();
        step -= len;
      } else {
        this.x += (dx / len) * step;
        this.z += (dz / len) * step;
        step = 0;
      }
    }
    this.figure.update(dt, this.x, this.z, this.yaw, this.speed);
    if (this.sitting && this.speed === 0) this.figure.setSitting(true);
  }
}

/** Le poste de Sabine : derrière la caisse 1, tournée vers le tapis. */
export const SABINE_POST = { x: 24.0, z: 4.0, yaw: -Math.PI / 2 };

/**
 * Les personnages secondaires : Sabine et deux clients insomniaques
 * (le vieux monsieur à la banane et une étudiante en sweat) qui partent avant 01:00.
 */
export class NpcSystem {
  readonly sabine: Walker;
  readonly customers: { walker: Walker; leavesAt: number; leaving: boolean }[];

  constructor(
    scene: Scene,
    private readonly graph: NavGraph,
    private readonly rng: Rng,
  ) {
    const sabine = new Figure(scene, "sabine", { top: "#8c1f28", bottom: "#1d1d20", skin: "#c49a82", hair: "#2a1a12", bun: true, scale: 0.96 });
    this.sabine = new Walker("sabine", sabine, 1.35);
    this.collider(scene, sabine);

    const papy = new Figure(scene, "client-banane", { top: "#6b6a58", bottom: "#3b3a33", skin: "#caa58d", hair: "#c9c9c4", hat: "#4a4a44", scale: 0.95 });
    const etudiante = new Figure(scene, "cliente-sweat", { top: "#3a5f8a", bottom: "#23252a", skin: "#8f6a52", hair: "#141010", scale: 0.93 });
    this.customers = [
      { walker: new Walker("client-banane", papy, 0.7), leavesAt: 38, leaving: false },
      { walker: new Walker("cliente-sweat", etudiante, 1.0), leavesAt: 52, leaving: false },
    ];
    for (const c of this.customers) this.collider(scene, c.walker.figure);
  }

  get all(): Walker[] {
    return [this.sabine, ...this.customers.map((c) => c.walker)];
  }

  /** Début de nuit. */
  reset(): void {
    this.sabine.figure.setEnabled(true);
    this.sabine.place(SABINE_POST.x, SABINE_POST.z, SABINE_POST.yaw);
    this.sabine.sitting = false;
    this.sabine.figure.update(0, SABINE_POST.x, SABINE_POST.z, SABINE_POST.yaw, 0);
    const starts = [
      { x: 7, z: 16.5 },
      { x: 18, z: 40.5 },
    ];
    this.customers.forEach((c, i) => {
      c.leaving = false;
      c.walker.figure.setEnabled(true);
      c.walker.place(starts[i].x, starts[i].z, 0);
    });
  }

  update(dt: number, minutes: number): void {
    this.sabine.update(dt);
    for (const c of this.customers) {
      const w = c.walker;
      if (!w.active) continue;
      if (!c.leaving && minutes >= c.leavesAt) {
        // Il passe en caisse… puis sort par les portes automatiques.
        c.leaving = true;
        w.path = [...this.route(w, { x: 18, z: 10.5 }), { x: 19.5, z: 7.5 }, { x: 18, z: 1.2 }, { x: 18, z: -2.5, onReach: () => w.figure.setEnabled(false) }];
      }
      if (!c.leaving && w.arrived) {
        // Promenade d'un rayon à l'autre, avec des pauses devant les étagères.
        const aisles = this.graph.nodes.filter((n) => n.slot !== undefined && this.graph.walkable(n.id));
        const next = this.rng.pick(aisles);
        const pause = { x: next.x, z: next.z + this.rng.range(-3, 3) };
        w.path = [...this.route(w, next), pause, pause];
      }
      w.update(dt);
    }
  }

  /** Emmène Sabine de sa caisse jusqu'au fond de la chambre froide. */
  sendSabineToColdRoom(openReserve: () => void, openColdRoom: () => void): void {
    this.sabine.sitting = false;
    this.sabine.figure.setSitting(false);
    this.sabine.path = [
      { x: 24.0, z: 7.6 },
      { x: 23.5, z: 10.5 },
      { x: 23.5, z: 47.5, onReach: openReserve },
      { x: 23.5, z: 50.6 },
      { x: 19.5, z: 53.65 },
      { x: 15.4, z: 53.65, onReach: openColdRoom },
      { x: 12.5, z: 53.65 },
      { x: 10.5, z: 56.2 },
    ];
  }

  private route(w: Walker, to: { x: number; z: number }): Waypoint[] {
    const start = this.graph.nearest(w.x, w.z);
    const end = this.graph.nearest(to.x, to.z);
    return this.graph.path(start.id, end.id).map((id) => ({ x: this.graph.nodes[id].x, z: this.graph.nodes[id].z }));
  }

  /** On ne traverse pas les gens. */
  private collider(scene: Scene, f: Figure): void {
    const c = MeshBuilder.CreateCylinder(`${f.root.name}-collision`, { diameter: 0.55, height: 1.7 }, scene);
    c.parent = f.root;
    c.position.y = 0.85;
    c.isVisible = false;
    c.isPickable = false;
    c.checkCollisions = true;
  }
}
