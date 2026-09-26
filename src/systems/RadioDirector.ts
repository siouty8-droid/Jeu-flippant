import { CONFIG } from "../config";
import { distanceToSlot } from "../world/ReshuffleSystem";
import { HALLOWEEN_MODULE, type StoreLayout } from "../world/StoreLayout";

export interface RadioChoice {
  /** Clé du morceau à jouer, ou null (silence). */
  track: string | null;
  kind: "normal" | "unknown";
  /** Slot dont on entend les haut-parleurs. */
  slot: number | null;
  /** 0 = haut-parleur au-dessus de toi, 1 = presque rien, à travers les murs. */
  muffle: number;
}

/** À travers quels murs on entend la radio, selon la pièce. */
const MUFFLE: Record<string, number | null> = {
  securite: 0.55,
  reserve: 0.6,
  technique: 0.85,
  dehors: 0.8,
  froide: null,
};

/**
 * Quel morceau passe là où tu es (logique pure, testée).
 *
 * Chaque rayon du plan a son morceau, diffusé par les haut-parleurs de son emplacement.
 * Si l'emplacement a été réagencé (le rayon n'est plus celui du plan), un morceau inconnu
 * passe à la place. Dans les allées, on entend l'emplacement le plus proche.
 * Entre 04:00 et 05:00, tant que Sabine est enfermée, la radio boucle sur un seul morceau inconnu.
 */
export class RadioDirector {
  private slot: number | null = null;

  constructor(private readonly layout: StoreLayout) {}

  reset(): void {
    this.slot = null;
  }

  /** Numéro du morceau (0..7) d'un emplacement : celui du rayon qui y est sur le plan. */
  trackOfSlot(slot: number): number {
    let module = this.layout.initialAssignment[slot];
    // Le présentoir Halloween n'est pas un rayon : il passe le morceau du rayon devant lui.
    if (module === HALLOWEEN_MODULE) module = this.layout.initialAssignment[Math.max(0, slot - 3)];
    return module - 1;
  }

  /** L'emplacement contient-il toujours le rayon du plan ? */
  stable(slot: number): boolean {
    return this.layout.assignment[slot] === this.layout.initialAssignment[slot];
  }

  choose(x: number, z: number, zoneId: string, haunted: boolean): RadioChoice {
    const muffle = MUFFLE[zoneId] === undefined ? 0 : MUFFLE[zoneId];
    if (muffle === null) return { track: null, kind: "normal", slot: null, muffle: 1 };

    const slot = this.nearestSlot(x, z);
    if (haunted) return { track: "inconnu-boucle", kind: "unknown", slot, muffle };
    if (this.stable(slot)) return { track: `normal-${this.trackOfSlot(slot)}`, kind: "normal", slot, muffle };
    return { track: `inconnu-${slot}-${this.layout.assignment[slot]}`, kind: "unknown", slot, muffle };
  }

  /** Emplacement dont on entend les haut-parleurs, avec un peu d'hystérésis entre deux zones. */
  private nearestSlot(x: number, z: number): number {
    const inside = this.layout.slotAt(x, z);
    if (inside) return (this.slot = inside.index);
    let best = 0;
    let bestD = Infinity;
    for (const s of this.layout.slots) {
      const d = distanceToSlot(s, x, z);
      if (d < bestD) {
        bestD = d;
        best = s.index;
      }
    }
    if (this.slot !== null && this.slot !== best) {
      const current = distanceToSlot(this.layout.slots[this.slot], x, z);
      if (current - bestD < CONFIG.radio.switchHysteresis) return this.slot;
    }
    return (this.slot = best);
  }
}
