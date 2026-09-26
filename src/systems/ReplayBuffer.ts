import { CONFIG } from "../config";
import type { ShopperState } from "./ShopperBrain";

/**
 * Règle 2 : les caméras montrent le magasin d'il y a quelques minutes.
 * On n'enregistre pas de vidéo : on garde des instantanés de l'état du magasin
 * et on les rejoue dans les écrans du poste de sécurité.
 */

export interface ActorPose {
  x: number;
  z: number;
  yaw: number;
}

export interface Snapshot {
  /** Heure de jeu, en minutes. */
  t: number;
  assignment: number[];
  player: ActorPose;
  shopper: (ActorPose & { state: ShopperState; speed: number; lookAtLens?: boolean }) | null;
  /** État de chaque néon : 0 blanc, 1 clignotement, 2 orange. */
  neons: Uint8Array;
}

/** Décalage des caméras (minutes de jeu) à une heure donnée : entre 2 et 4 min, jamais constant. */
export function cameraDelay(minutes: number): number {
  const c = CONFIG.cameras;
  const mid = (c.delayMinMinutes + c.delayMaxMinutes) / 2;
  const amp = (c.delayMaxMinutes - c.delayMinMinutes) / 2;
  return mid + amp * Math.sin((minutes / c.delayPeriodMinutes) * Math.PI * 2);
}

export class ReplayBuffer {
  private readonly snapshots: Snapshot[] = [];

  get length(): number {
    return this.snapshots.length;
  }

  get oldest(): number | null {
    return this.snapshots[0]?.t ?? null;
  }

  push(s: Snapshot): void {
    // Un saut en arrière dans le temps (nouvelle nuit, debug) invalide tout ce qui suit.
    while (this.snapshots.length > 0 && this.snapshots[this.snapshots.length - 1].t > s.t) this.snapshots.pop();
    this.snapshots.push(s);
    const limit = s.t - CONFIG.cameras.retentionMinutes;
    while (this.snapshots.length > 0 && this.snapshots[0].t < limit) this.snapshots.shift();
  }

  clear(): void {
    this.snapshots.length = 0;
  }

  /**
   * État du magasin à l'instant t (interpolé entre deux instantanés), ou null s'il n'y a pas
   * d'enregistrement pour ce moment (début de nuit, saut dans le temps) : « PAS DE SIGNAL ».
   */
  at(t: number): Snapshot | null {
    const s = this.snapshots;
    if (s.length === 0 || t < s[0].t || t > s[s.length - 1].t) return null;
    // Recherche dichotomique du dernier instantané <= t.
    let lo = 0;
    let hi = s.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (s[mid].t <= t) lo = mid;
      else hi = mid - 1;
    }
    const a = s[lo];
    const b = s[lo + 1];
    // Trou dans l'enregistrement (plus de 30 s de jeu) : pas de signal.
    if (!b) return a;
    if (b.t - a.t > 0.5) return null;
    const k = (t - a.t) / (b.t - a.t);
    return {
      t,
      assignment: k < 0.5 ? a.assignment : b.assignment,
      neons: k < 0.5 ? a.neons : b.neons,
      player: lerpPose(a.player, b.player, k),
      shopper: a.shopper && b.shopper ? { ...lerpPose(a.shopper, b.shopper, k), state: b.shopper.state, speed: b.shopper.speed } : (k < 0.5 ? a.shopper : b.shopper),
    };
  }
}

function lerpPose(a: ActorPose, b: ActorPose, k: number): ActorPose {
  let d = b.yaw - a.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, yaw: a.yaw + d * k };
}
