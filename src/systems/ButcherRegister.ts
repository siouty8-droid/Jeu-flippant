/**
 * La caisse de la boucherie : fermée par un code à 4 chiffres. Le double de la clé de la
 * chambre froide est dans le tiroir. Le code ne se lit que sur les caméras en différé
 * (narrative/ReplayEvents.ts) : une silhouette le tape alors qu'en direct, il n'y avait personne.
 */
export class ButcherRegister {
  entry = "";
  opened = false;
  /** Farid a déjà essayé de l'ouvrir cette nuit (pour les indices de Sabine). */
  examined = false;

  constructor(readonly code: string) {}

  reset(): void {
    this.entry = "";
    this.opened = false;
    this.examined = false;
  }

  /** Un chiffre tapé. Au quatrième, la caisse vérifie. */
  press(digit: string): "more" | "ok" | "wrong" {
    if (this.opened) return "ok";
    this.entry += digit;
    if (this.entry.length < this.code.length) return "more";
    const ok = this.entry === this.code;
    this.entry = "";
    if (ok) this.opened = true;
    return ok ? "ok" : "wrong";
  }

  erase(): void {
    this.entry = this.entry.slice(0, -1);
  }

  /** Ce qu'affiche l'afficheur client : les chiffres tapés, des tirets pour le reste. */
  display(): string {
    if (this.opened) return "OUVERT";
    return (this.entry + "----").slice(0, 4);
  }
}

/** Afficheur à une étape de la scène rejouée : `k` = minutes de jeu depuis le début de la scène. */
export function replayedDisplay(code: string, k: number): string {
  if (k >= 1.05) return "OUVERT";
  const typed = Math.max(0, Math.min(code.length, Math.floor((k - 0.3) / 0.2) + 1));
  return (code.slice(0, typed) + "----").slice(0, 4);
}
