import { Color3, type StandardMaterial } from "@babylonjs/core";
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
  material: StandardMaterial;
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

  constructor(
    neons: NeonFixture[],
    private readonly audio: AudioEngine,
    private readonly rng: Rng,
  ) {
    this.tubes = neons.map((fixture, i) => {
      // Chaque tube a son propre matériau pour changer de couleur indépendamment.
      const material = (fixture.tube.material as StandardMaterial).clone(`neon-${i}`) as StandardMaterial;
      fixture.tube.material = material;
      return { fixture, material, state: "white", level: 1, flickerTimer: 0, crackleCooldown: 0, forcedFlicker: 0 };
    });
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

  /** Couleur et intensité à donner à une vraie lumière placée sous ce néon. */
  light(index: number): { color: Color3; level: number } {
    const t = this.tubes[index];
    return { color: t.state === "orange" ? ORANGE : t.fixture.cold ? COLD : WHITE, level: t.level };
  }

  update(dt: number, threat: Threat | null, listener: { x: number; z: number }): void {
    const c = CONFIG.neons;
    for (const t of this.tubes) {
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

      const base = state === "orange" ? ORANGE : t.fixture.cold ? COLD : WHITE;
      t.material.emissiveColor.copyFromFloats(base.r * t.level, base.g * t.level, base.b * t.level);
    }
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

