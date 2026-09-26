import { CONFIG } from "../config";
import type { EventBus } from "../core/EventBus";
import type { Rng } from "../core/Rng";
import type { DwellTracker } from "../systems/DwellTracker";
import { isSlotHidden, type Eye, type OcclusionMap } from "./Occlusion";
import { HALLOWEEN_MODULE, RAYON_9, type Slot, type StoreLayout } from "./StoreLayout";

export type ReshuffleCause = "detour" | "stagnation" | "rayon9" | "debug" | "final";

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
  /** Redessin final : l'agencement vers lequel le magasin converge, emplacement caché par emplacement caché. */
  private target: number[] | null = null;
  private targetTimeout = 0;
  /** Emplacements que le détour et le rayon 9 ne touchent plus (le chemin stable de la fin). */
  readonly protectedSlots = new Set<number>();

  constructor(
    private readonly layout: StoreLayout,
    private readonly occ: OcclusionMap,
    private readonly dwell: DwellTracker,
    private readonly rng: Rng,
    private readonly bus: EventBus,
    /** Appelé après chaque changement d'assignation, pour replacer les modules 3D. */
    private readonly apply: (changedSlots: number[]) => void,
  ) {}

  /** Nouvelle nuit : on oublie tout. */
  reset(): void {
    this.unstable.clear();
    this.sinceEvaluation = 0;
    this.sinceSwap = Infinity;
    this.sinceRayon9Move = 0;
    this.forceRequested = false;
    this.lastCause = null;
    this.target = null;
    this.protectedSlots.clear();
  }

  /**
   * Fin de nuit : Farid porte Sabine, le magasin se redessine entièrement. Chaque emplacement
   * rejoint `target` dès qu'il est caché (jamais sous ses yeux). `stable` : le chemin qu'on laisse
   * tel que sur le plan (la radio y passe les morceaux connus).
   */
  setTarget(target: number[], stable: number[]): void {
    this.target = [...target];
    this.targetTimeout = 40;
    this.protectedSlots.clear();
    for (const s of stable) this.protectedSlots.add(s);
    this.unstable.clear();
  }

  get converging(): boolean {
    return this.target !== null;
  }

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

  /**
   * @param avoid positions à ne jamais recouvrir d'un nouveau rayon (le client, les PNJ)
   */
  update(dt: number, minutes: number, eye: Eye, player: { x: number; z: number }, avoid: readonly { x: number; z: number }[] = []): void {
    this.sinceSwap += dt;
    this.sinceRayon9Move += dt;
    this.sinceEvaluation += dt;
    this.targetTimeout -= dt;
    const stagnated = this.dwell.consumeTrigger();
    if (this.sinceEvaluation < 1 / CONFIG.reshuffle.evaluationsPerSecond && !stagnated) return;
    this.sinceEvaluation = 0;

    const active = minutes >= CONFIG.reshuffle.activeFromMinutes;
    if (!active && !this.forceRequested) {
      // Avant 01:10 le magasin est normal : on oublie les sorties de rayon.
      this.unstable.clear();
      return;
    }

    if (this.target) {
      if (this.targetTimeout <= 0 || this.target.every((m, s) => this.layout.assignment[s] === m)) this.target = null;
    }
    const cooldownReady = this.sinceSwap >= CONFIG.reshuffle.minSecondsBetweenSwaps;
    const rayon9Due =
      minutes >= CONFIG.reshuffle.rayon9AppearsAtMinutes &&
      (this.layout.slotOfModule(RAYON_9) === -1 || this.sinceRayon9Move >= CONFIG.reshuffle.rayon9SecondsBetweenMoves);
    // Le calcul de visibilité est le plus cher : on ne le fait que si quelque chose peut bouger.
    if (!this.forceRequested && !stagnated && !rayon9Due && !this.target && !(cooldownReady && this.unstable.size > 0)) return;
    const hidden = this.hiddenSlots(eye, player);
    for (const p of avoid) for (const s of [...hidden]) if (distanceToSlot(this.layout.slots[s], p.x, p.z) < 1) hidden.delete(s);
    const cooldownOk = this.sinceSwap >= CONFIG.reshuffle.minSecondsBetweenSwaps;

    if (this.forceRequested) {
      this.forceRequested = false;
      if (this.swapNearest(hidden, player, "debug")) return;
    }

    if (this.target && this.stepTowardTarget(hidden)) return;

    // La stagnation passe en premier : c'est la réponse directe à ce que fait le joueur.
    if (stagnated && this.swapNearest(hidden, player, "stagnation")) return;
    if (minutes >= CONFIG.reshuffle.rayon9AppearsAtMinutes && this.tryRayon9(hidden)) return;
    if (!cooldownOk) return;

    for (const slot of [...this.unstable]) {
      if (!hidden.has(slot) || this.protectedSlots.has(slot)) continue;
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

  /** Un échange de plus vers l'agencement final, entre deux emplacements cachés. */
  private stepTowardTarget(hidden: Set<number>): boolean {
    const asg = this.layout.assignment;
    for (const s of hidden) {
      const want = this.target![s];
      if (asg[s] === want) continue;
      const other = asg.indexOf(want);
      if (other === -1 || other === s || !hidden.has(other)) continue;
      this.swap(s, other, "final");
      return true;
    }
    return false;
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
    const candidates = [...hidden].filter((s) => s !== slot && !this.protectedSlots.has(s));
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
      if (halloweenSlot === -1 || !hidden.has(halloweenSlot) || this.protectedSlots.has(halloweenSlot) || this.target) return false;
      this.layout.assignment[halloweenSlot] = RAYON_9;
      this.markChanged([halloweenSlot], "rayon9");
      this.sinceRayon9Move = 0;
      return true;
    }
    // Le rayon 9 ne tient pas en place.
    if (this.sinceRayon9Move < CONFIG.reshuffle.rayon9SecondsBetweenMoves || !hidden.has(nineSlot) || this.target) return false;
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

/**
 * L'agencement de la fin de nuit : un chemin d'emplacements (un par rangée, du fond vers
 * l'entrée, qui ne se décale que d'une colonne à la fois) reste tel que sur le plan ;
 * tous les autres emplacements changent de rayon.
 */
export function finalLayout(current: readonly number[], initial: readonly number[], rng: Rng): { target: number[]; stable: number[] } {
  const present = new Set(current);
  const clamp = (c: number) => Math.max(0, Math.min(2, c));
  let stable: number[] = [];
  for (let tries = 0; tries < 60; tries++) {
    const c2 = rng.int(0, 2);
    const c1 = clamp(c2 + rng.int(-1, 1));
    const c0 = clamp(c1 + rng.int(-1, 1));
    const path = [6 + c2, 3 + c1, c0];
    if (path.every((s) => present.has(initial[s]))) {
      stable = path;
      break;
    }
  }
  const target: number[] = new Array(current.length).fill(-1);
  for (const s of stable) target[s] = initial[s];
  const restSlots = current.map((_, s) => s).filter((s) => !stable.includes(s));
  const restModules = current.filter((m) => !stable.some((s) => initial[s] === m));
  // Mélange jusqu'à ce qu'aucun autre emplacement ne retrouve son rayon du plan.
  let best = restModules;
  let bestFixed = Infinity;
  for (let tries = 0; tries < 200 && bestFixed > 0; tries++) {
    const shuffled = [...restModules];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const fixed = restSlots.filter((s, i) => shuffled[i] === initial[s]).length;
    if (fixed < bestFixed) {
      bestFixed = fixed;
      best = shuffled;
    }
  }
  restSlots.forEach((s, i) => (target[s] = best[i]));
  return { target, stable };
}
