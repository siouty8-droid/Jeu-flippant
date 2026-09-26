import { CONFIG } from "../config";
import type { Rng } from "../core/Rng";
import type { ItemKey } from "../world/StoreLayout";

/**
 * La serrure de la chambre froide (étape 8, logique pure et testée).
 *
 * 1. 01:10 : un verrou neuf apparaît, aucune clé du trousseau ne rentre. Il faut le double
 *    (caisse de la boucherie).
 * 2. Dès que Farid a le double en poche, la serrure change quand personne ne la regarde :
 *    c'est maintenant celle du local technique. Le double ne sert plus à rien.
 * 3. La clé du trousseau qui correspond marche, mais seulement si Farid n'a pas stagné
 *    dans les 30 dernières secondes. Sinon elle rentre sans tourner, et la serrure change
 *    encore dès qu'il détourne les yeux. « Elle bouge quand t'attends… viens direct. »
 */

/** À quelle serrure elle ressemble. `verrou` : le verrou neuf du début. */
export type LockLook = "verrou" | "technique" | "secours" | "securite";

export const LOCK_KEY: Record<Exclude<LockLook, "verrou">, ItemKey> = {
  technique: "cle-technique",
  secours: "cle-secours",
  securite: "cle-securite",
};

/** Couleur de la pastille, la même que sur la clé du trousseau. */
export const LOCK_COLOR: Record<LockLook, string> = {
  verrou: "#c9a54a",
  technique: "#2f6fd6",
  secours: "#1fae45",
  securite: "#d63a2f",
};

const LOOK_NAME: Record<Exclude<LockLook, "verrou">, string> = {
  technique: "du local technique (pastille bleue)",
  secours: "des sorties de secours (pastille verte)",
  securite: "du poste de sécurité (pastille rouge)",
};

export type LockAttempt =
  | { result: "no-double" | "double-useless" | "changed" | "wrong-moment"; message: string }
  | { result: "open"; message: string };

export class ColdLock {
  look: LockLook = "verrou";
  open = false;
  /** Secondes depuis la dernière fois que Farid a stagné. */
  sinceStall = Infinity;
  /** Nombre de tentatives ratées (pour les indices de Sabine). */
  failures = 0;
  /** Changements de serrure (pour les indices et le debug). */
  changes = 0;
  private pendingChange = false;
  /** Dernière serrure que Farid a examinée : une serrure qui a changé s'examine avant d'essayer une clé. */
  private examined: LockLook = "verrou";

  constructor(private readonly rng: Rng) {}

  reset(): void {
    this.look = "verrou";
    this.open = false;
    this.sinceStall = Infinity;
    this.failures = 0;
    this.changes = 0;
    this.pendingChange = false;
    this.examined = "verrou";
  }

  /**
   * @param stagnation secondes de stagnation en cours (DwellTracker)
   * @param lockSeen le joueur voit la serrure en ce moment (rien ne change sous ses yeux)
   * @returns vrai si la serrure vient de changer
   */
  update(dt: number, stagnation: number, hasDouble: boolean, lockSeen: boolean): boolean {
    if (stagnation >= CONFIG.puzzles.stallSeconds) this.sinceStall = 0;
    else this.sinceStall += dt;
    if (this.open || lockSeen) return false;
    if (this.look === "verrou" && hasDouble) {
      this.change("technique");
      return true;
    }
    if (this.pendingChange) {
      this.pendingChange = false;
      const others = (Object.keys(LOCK_KEY) as Exclude<LockLook, "verrou">[]).filter((l) => l !== this.look);
      this.change(this.rng.pick(others));
      return true;
    }
    return false;
  }

  /** Nom de la serrure pour les messages. */
  describe(): string {
    return this.look === "verrou" ? "un verrou neuf, avec un cadenas en laiton" : `une serrure ${LOOK_NAME[this.look]}`;
  }

  prompt(): string {
    if (this.look === "verrou" || this.look !== this.examined) return "[E] Examiner le verrou";
    return `[E] Essayer la clé ${LOOK_NAME[this.look].replace(/ \(.*\)/, "")}`;
  }

  /** Farid essaie d'ouvrir. `has` : ce qu'il a sur lui. */
  attempt(has: (item: string) => boolean): LockAttempt {
    if (this.open) return { result: "open", message: "" };
    if (this.look === "verrou") {
      if (!has("double-froide")) return { result: "no-double", message: "Un verrou vissé côté réserve. Il existait pas hier. Aucune clé du trousseau ne rentre." };
      // Cas rare : il a le double et n'a jamais quitté la serrure des yeux. Elle change quand même.
      this.pendingChange = true;
      return { result: "double-useless", message: "Le double rentre… et tourne dans le vide." };
    }
    if (this.examined !== this.look) {
      const first = this.examined === "verrou";
      this.examined = this.look;
      const what = `${this.describe().replace(/^une/, "Une")}.`;
      return { result: "changed", message: first ? `C'est plus le même verrou. ${what} Le double rentre même pas.` : `Elle a encore changé. ${what}` };
    }
    const key = LOCK_KEY[this.look];
    if (!has(key)) return { result: "wrong-moment", message: "Pas la bonne clé." };
    if (this.sinceStall >= CONFIG.puzzles.lockCleanSeconds) {
      this.open = true;
      return { result: "open", message: "Ça tourne. Le verrou saute." };
    }
    this.failures++;
    this.pendingChange = true;
    return { result: "wrong-moment", message: "La clé rentre… mais elle tourne pas. Comme si la serrure attendait quelque chose." };
  }

  private change(look: LockLook): void {
    this.look = look;
    this.changes++;
  }
}

/** Le code de la caisse de la boucherie : 4 chiffres de 1 à 9, fixés par la graine du magasin. */
export function registerCode(rng: Rng): string {
  return Array.from({ length: 4 }, () => String(rng.int(1, 9))).join("");
}
