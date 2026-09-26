import { CONFIG } from "../config";
import type { EventBus } from "../core/EventBus";
import type { Rng } from "../core/Rng";
import type { DwellTracker } from "../systems/DwellTracker";
import { isSlotHidden, type Eye, type OcclusionMap } from "./Occlusion";
import { HALLOWEEN_MODULE, RAYON_9, type Slot, type StoreLayout } from "./StoreLayout";

export type ReshuffleCause = "detour" | "stagnation" | "rayon9" | "debug";

/**
 * Règle 1 : les rayons ne sont plus fixes.
 *
 * - Quand le joueur quitte un rayon, ce rayon devient « instable ». Dès qu'il est
 *   complètement caché, on tire au sort s'il bouge (moins il est ancré, plus il bouge),
 *   et s'il bouge, il échange sa place avec un autre slot caché.
 *   Si le joueur fait demi-tour tout de suite, le rayon n'a jamais été caché : rien n'a
 *   bougé. S'il revient par un autre chemin, le rayon a eu le temps de disparaître de sa
 *   vue… et de changer.
 * - Stagnation : quand le DwellTracker se déclenche, deux slots cachés proches du joueur
 *   échangent leur place.
 * - Rayon 9 : à partir de 2h30, il remplace le présentoir Halloween dès que ce slot est
 *   caché, puis change de place régulièrement.
 *
 * Règle d'or : on ne touche jamais à un slot visible (cf. Occlusion.isSlotHidden).
 */
export class ReshuffleSystem {
  /** Slots quittés par le joueur, en attente d'un tirage. */
  private readonly unstable = new Set<number>();
  private sinceEvaluation = 0;
  private sinceSwap = Infinity;
  private sinceRayon9Move = 0;
  swapCount = 0;
  lastCause: ReshuffleCause | null = null;
  private forceRequested = false;

  constructor(
    private readonly layout: StoreLayout,
    private readonly occ: OcclusionMap,
    private readonly dwell: DwellTracker,
    private readonly rng: Rng,
    private readonly bus: EventBus,
    /** Appelé après chaque changement d'assignation, pour replacer les modules 3D. */
    private readonly apply: (changedSlots: number[]) => void,
  ) {}

  /** Le joueur vient de sortir de ce slot. */
  markExited(slotIndex: number): void {
    this.unstable.add(slotIndex);
  }

  get unstableSlots(): number[] {
    return [...this.unstable];
  }

  /** Debug : force un échange de deux slots cachés, quelle que soit l'heure. */
  force(): void {
    this.forceRequested = true;
    this.sinceEvaluation = Infinity;
  }

  update(dt: number, minutes: number, eye: Eye, player: { x: number; z: number }): void {
    this.sinceSwap += dt;
    this.sinceRayon9Move += dt;
    this.sinceEvaluation += dt;
    const stagnated = this.dwell.consumeTrigger();
    if (this.sinceEvaluation < 1 / CONFIG.reshuffle.evaluationsPerSecond && !stagnated) return;
    this.sinceEvaluation = 0;

    const active = minutes >= CONFIG.reshuffle.activeFromMinutes;
    if (!active && !this.forceRequested) {
      // Avant 01:10 le magasin est normal : on oublie les sorties de rayon.
      this.unstable.clear();
      return;
    }

    const hidden = this.hiddenSlots(eye, player);
    const cooldownOk = this.sinceSwap >= CONFIG.reshuffle.minSecondsBetweenSwaps;

    if (this.forceRequested) {
      this.forceRequested = false;
      if (this.swapNearest(hidden, player, "debug")) return;
    }

    // La stagnation passe en premier : c'est la réponse directe à ce que fait le joueur.
    if (stagnated && this.swapNearest(hidden, player, "stagnation")) return;
    if (minutes >= CONFIG.reshuffle.rayon9AppearsAtMinutes && this.tryRayon9(hidden)) return;
    if (!cooldownOk) return;

    for (const slot of [...this.unstable]) {
      if (!hidden.has(slot)) continue;
      this.unstable.delete(slot);
      const moduleId = this.layout.assignment[slot];
      const c = CONFIG.reshuffle;
      const chance = c.exitMoveChanceMax - (c.exitMoveChanceMax - c.exitMoveChanceMin) * this.dwell.anchor(moduleId);
      if (!this.rng.chance(chance)) continue;
      const partner = this.pickPartner(slot, hidden);
      if (partner === null) continue;
      this.swap(slot, partner, "detour");
      return;
    }
  }

  /** Slots entièrement cachés et assez loin du joueur pour qu'on puisse y toucher. */
  hiddenSlots(eye: Eye, player: { x: number; z: number }): Set<number> {
    const out = new Set<number>();
    for (const slot of this.layout.slots) {
      if (distanceToSlot(slot, player.x, player.z) < CONFIG.reshuffle.playerClearance) continue;
      if (isSlotHidden(eye, slot, this.layout.assignment[slot.index], this.occ)) out.add(slot.index);
    }
    return out;
  }

  /** Partenaire d'échange : un autre slot caché, de préférence peu ancré. */
  private pickPartner(slot: number, hidden: Set<number>): number | null {
    const candidates = [...hidden].filter((s) => s !== slot);
    if (candidates.length === 0) return null;
    const weights = candidates.map((s) => 1.1 - this.dwell.anchor(this.layout.assignment[s]));
    let r = this.rng.next() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < candidates.length; i++) {
      r -= weights[i];
      if (r <= 0) return candidates[i];
    }
    return candidates[candidates.length - 1];
  }

  /** Échange deux slots cachés parmi les plus proches du joueur. */
  private swapNearest(hidden: Set<number>, player: { x: number; z: number }, cause: ReshuffleCause): boolean {
    const near = [...hidden]
      .map((s) => ({ s, d: distanceToSlot(this.layout.slots[s], player.x, player.z) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 4)
      .map((e) => e.s);
    if (near.length < 2) return false;
    const a = near[this.rng.int(0, near.length - 1)];
    const rest = near.filter((s) => s !== a);
    const b = rest[this.rng.int(0, rest.length - 1)];
    this.swap(a, b, cause);
    return true;
  }

  private tryRayon9(hidden: Set<number>): boolean {
    const nineSlot = this.layout.slotOfModule(RAYON_9);
    if (nineSlot === -1) {
      const halloweenSlot = this.layout.slotOfModule(HALLOWEEN_MODULE);
      if (halloweenSlot === -1 || !hidden.has(halloweenSlot)) return false;
      this.layout.assignment[halloweenSlot] = RAYON_9;
      this.markChanged([halloweenSlot], "rayon9");
      this.sinceRayon9Move = 0;
      return true;
    }
    // Le rayon 9 ne tient pas en place.
    if (this.sinceRayon9Move < CONFIG.reshuffle.rayon9SecondsBetweenMoves || !hidden.has(nineSlot)) return false;
    const partner = this.pickPartner(nineSlot, hidden);
    if (partner === null) return false;
    this.swap(nineSlot, partner, "rayon9");
    this.sinceRayon9Move = 0;
    return true;
  }

  private swap(a: number, b: number, cause: ReshuffleCause): void {
    const asg = this.layout.assignment;
    [asg[a], asg[b]] = [asg[b], asg[a]];
    this.unstable.delete(a);
    this.unstable.delete(b);
    this.markChanged([a, b], cause);
  }

  private markChanged(slots: number[], cause: ReshuffleCause): void {
    this.sinceSwap = 0;
    this.swapCount++;
    this.lastCause = cause;
    this.apply(slots);
    this.bus.emit("store:reshuffle", { slots, cause });
  }
}

export function distanceToSlot(slot: Slot, x: number, z: number): number {
  const dx = Math.max(slot.x0 - x, 0, x - slot.x1);
  const dz = Math.max(slot.z0 - z, 0, z - slot.z1);
  return Math.hypot(dx, dz);
}
