import { Color3, Matrix, MeshBuilder, Quaternion, StandardMaterial, type Mesh, type Scene } from "@babylonjs/core";
import type { AudioEngine } from "../audio/AudioEngine";
import { neonCrackle } from "../audio/Sounds";
import { CONFIG } from "../config";
import type { Rng } from "../core/Rng";
import type { NeonFixture } from "../world/WorldBuilder";
import type { ShopperState } from "./ShopperBrain";

export type NeonState = "white" | "flicker" | "orange";

export interface Threat {
  x: number;
  z: number;
  state: ShopperState;
}

const WHITE = new Color3(0.96, 0.97, 1.0);
const COLD = new Color3(0.72, 0.89, 1.0);
const ORANGE = new Color3(1.0, 0.5, 0.12);

interface Tube {
  fixture: NeonFixture;
  state: NeonState;
  /** Luminosité actuelle, 0..1. */
  level: number;
  flickerTimer: number;
  crackleCooldown: number;
  forcedFlicker: number;
}

/**
 * Règle 3 : les néons au-dessus de toi disent si tu es en sécurité.
 * - blanc : rien ;
 * - clignotement : quelque chose approche de cette allée ;
 * - orange : quelque chose est DÉJÀ dans l'allée (client arrêté ou en traque), même si tu ne vois rien.
 */
export class NeonSystem {
  private readonly tubes: Tube[];
  /** Tous les tubes en un seul mesh à instances fines : une draw call, une couleur par tube. */
  private readonly mesh: Mesh;
  private readonly colors: Float32Array;
  private saved: Float32Array | null = null;

  constructor(
    scene: Scene,
    neons: NeonFixture[],
    private readonly audio: AudioEngine,
    private readonly rng: Rng,
  ) {
    this.tubes = neons.map((fixture) => ({ fixture, state: "white", level: 1, flickerTimer: 0, crackleCooldown: 0, forcedFlicker: 0 }));

    const material = new StandardMaterial("neons", scene);
    // Sans éclairage, seule l'émissive compte ; elle est multipliée par la couleur de chaque tube.
    material.disableLighting = true;
    material.diffuseColor = new Color3(0, 0, 0);
    material.emissiveColor = new Color3(1, 1, 1);
    material.specularColor = new Color3(0, 0, 0);
    this.mesh = MeshBuilder.CreateBox("neons", { size: 1 }, scene);
    this.mesh.material = material;
    this.mesh.isPickable = false;
    const matrices = new Float32Array(neons.length * 16);
    neons.forEach((n, i) => {
      const t = n.tube;
      const size = t.getBoundingInfo().boundingBox.extendSize.scale(2);
      Matrix.Compose(size, Quaternion.Identity(), t.position.clone()).copyToArray(matrices, i * 16);
      t.dispose();
    });
    this.colors = new Float32Array(neons.length * 4).fill(1);
    this.mesh.thinInstanceSetBuffer("matrix", matrices, 16, true);
    this.mesh.thinInstanceSetBuffer("color", this.colors, 4, false);
    this.mesh.thinInstanceRefreshBoundingInfo(false);
  }

  private setColor(i: number, c: Color3, level: number): void {
    this.colors[i * 4] = c.r * level;
    this.colors[i * 4 + 1] = c.g * level;
    this.colors[i * 4 + 2] = c.b * level;
  }

  /** Fait vaciller les néons autour d'un point (le magasin vient de bouger à cause de la stagnation). */
  flickerAround(x: number, z: number, radius: number, seconds: number): void {
    for (const t of this.tubes) if (segmentDistance(t.fixture.seg, x, z) < radius) t.forcedFlicker = seconds * (0.6 + 0.4 * this.rng.next());
  }

  stateOf(index: number): NeonState {
    return this.tubes[index].state;
  }

  /** État du néon le plus proche d'un point (utile au debug et aux tests). */
  stateAt(x: number, z: number): NeonState {
    let best = this.tubes[0];
    let bestD = Infinity;
    for (const t of this.tubes) {
      const d = segmentDistance(t.fixture.seg, x, z);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best.state;
  }

  /** État de tous les néons (0 blanc, 1 clignotement, 2 orange), pour l'enregistrement des caméras. */
  captureStates(): Uint8Array {
    return Uint8Array.from(this.tubes, (t) => (t.state === "orange" ? 2 : t.state === "flicker" ? 1 : 0));
  }

  /** Applique temporairement des états passés (rendu d'une caméra), à annuler avec restoreStates. */
  applyStates(states: Uint8Array): void {
    this.saved = this.colors.slice();
    this.tubes.forEach((t, i) => {
      const st = states[i] ?? 0;
      const base = st === 2 ? ORANGE : t.fixture.cold ? COLD : WHITE;
      this.setColor(i, base, st === 1 ? 0.35 + 0.6 * this.rng.next() : 1);
    });
    this.mesh.thinInstanceBufferUpdated("color");
  }

  restoreStates(): void {
    if (!this.saved) return;
    this.colors.set(this.saved);
    this.saved = null;
    this.mesh.thinInstanceBufferUpdated("color");
  }

  /** Couleur et intensité à donner à une vraie lumière placée sous ce néon. */
  light(index: number): { color: Color3; level: number } {
    const t = this.tubes[index];
    return { color: t.state === "orange" ? ORANGE : t.fixture.cold ? COLD : WHITE, level: t.level };
  }

  update(dt: number, threat: Threat | null, listener: { x: number; z: number }): void {
    const c = CONFIG.neons;
    for (let i = 0; i < this.tubes.length; i++) {
      const t = this.tubes[i];
      t.forcedFlicker = Math.max(0, t.forcedFlicker - dt);
      t.crackleCooldown -= dt;
      let state: NeonState = "white";
      if (threat && threat.state !== "inactive") {
        const d = segmentDistance(t.fixture.seg, threat.x, threat.z);
        const alert = threat.state === "stopped" || threat.state === "hunting" || threat.state === "caught";
        if (alert && d < c.orangeDistance) state = "orange";
        else if (alert && d < c.flickerDistance) state = "flicker";
        else if (!alert && d < c.shoppingFlickerDistance) state = "flicker";
      }
      if (state === "white" && t.forcedFlicker > 0) state = "flicker";
      t.state = state;

      const wasOn = t.level > 0.5;
      if (state === "flicker") {
        t.flickerTimer -= dt;
        if (t.flickerTimer <= 0) {
          const on = !wasOn || this.rng.chance(0.3);
          t.level = on ? 0.75 + 0.25 * this.rng.next() : 0.05 + 0.15 * this.rng.next();
          t.flickerTimer = on ? this.rng.range(0.04, 0.35) : this.rng.range(0.03, 0.14);
        }
      } else if (state === "orange") {
        // Orange stable, avec de rares baisses.
        t.level = this.rng.chance(dt * 0.8) ? 0.55 : Math.min(1, t.level + dt * 4);
      } else {
        t.level = Math.min(1, t.level + dt * 6);
      }

      if (!wasOn && t.level > 0.5 && t.crackleCooldown <= 0) {
        const mid = { x: (t.fixture.seg.x0 + t.fixture.seg.x1) / 2, z: (t.fixture.seg.z0 + t.fixture.seg.z1) / 2 };
        if (Math.hypot(mid.x - listener.x, mid.z - listener.z) < 16) {
          neonCrackle(this.audio, { x: mid.x, y: 3.9, z: mid.z });
          t.crackleCooldown = 0.12;
        }
      }

      this.setColor(i, state === "orange" ? ORANGE : t.fixture.cold ? COLD : WHITE, t.level);
    }
    this.mesh.thinInstanceBufferUpdated("color");
  }
}

/** Distance (plan xz) d'un point au tube. */
export function segmentDistance(seg: NeonFixture["seg"], x: number, z: number): number {
  const dx = seg.x1 - seg.x0;
  const dz = seg.z1 - seg.z0;
  const len2 = dx * dx + dz * dz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - seg.x0) * dx + (z - seg.z0) * dz) / len2));
  return Math.hypot(x - (seg.x0 + t * dx), z - (seg.z0 + t * dz));
}

