/**
 * Les fins (étape 8). Logique pure et textes, testés dans tests/endings.test.ts.
 *
 * - Fin normale : Farid a sorti Sabine de la chambre froide avant 06:00 (dehors, ou dans ses bras
 *   quand le magasin ouvre). Les employés du matin arrivent, le magasin est parfaitement normal.
 * - Mauvaise fin (le froid) : 06:00 sans l'avoir sortie. La chambre froide est vide et propre,
 *   personne ne se souvient de Sabine.
 * - Boucle (pas une fin) : attrapé par le client, retour à 00:00. Un badge de plus dans la pile.
 * - Fin cachée : en plus de la fin, si Farid a vu le client fixer la CAM 2 en différé ET trouvé
 *   son propre badge dans la pile du local technique. Dernière image : la caméra du poste
 *   montre, en différé, Farid lui-même en train de regarder les écrans.
 */

export type EndingId = "sauvee" | "froid";

export interface EndingState {
  /** Farid porte Sabine (elle est sortie de la chambre froide). */
  carried: boolean;
  /** Ils sont sortis du magasin par l'entrée. */
  exited: boolean;
}

export function endingFor(s: EndingState): EndingId {
  return s.carried || s.exited ? "sauvee" : "froid";
}

export function endingText(id: EndingId, s: EndingState & { time: string }): string {
  if (id === "sauvee") {
    const opening = s.exited
      ? `${s.time}. Dehors, sur le parking. L'air est froid, mais pas comme là-dedans.`
      : "06:00. Les portes automatiques s'ouvrent. Vous êtes encore dans l'allée.";
    return [
      opening,
      "Les employés du matin arrivent. La lumière du jour entre par les vitrines. Dans le magasin, tout est à sa place.",
      `<span class="small">Sabine s'en sort. Hypothermie, trois jours d'hôpital. Vivante.</span>`,
    ].join("<br><br>");
  }
  return [
    "06:00. Les premiers employés arrivent. Le magasin est parfaitement normal.",
    "La chambre froide est vide et propre. À la caisse 1, un autre prénom sur le badge.",
    `<span class="small">Personne ne se souvient de Sabine.</span>`,
  ].join("<br><br>");
}

export const HIDDEN_ENDING_TEXT = "T'as peut-être déjà fait cette nuit.";

/** Les deux indices de la fin cachée, qui survivent aux boucles. */
export function hiddenEndingUnlocked(story: ReadonlySet<string>): boolean {
  return story.has("client-objectif") && story.has("badges-farid");
}

/**
 * Date d'embauche sur le badge. La première nuit : il y a trois semaines.
 * À chaque boucle, elle recule encore de trois semaines.
 */
export function badgeDate(loops: number): string {
  const d = new Date(Date.UTC(2025, 9, 31));
  d.setUTCDate(d.getUTCDate() - 21 * (loops + 1));
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Les anciens vigiles du magasin (le dernier a tenu dix jours, dixit Sabine). */
const FORMER_GUARDS = [
  "M. DUVAL · agent de sécurité · 2011 → 2014",
  "K. BENALI · agent de sécurité · 2014 → 2019",
  "J. PETIT · agent de sécurité · 2019 → 2023",
  "T. ROUSSEL · agent de sécurité · 18/09 → 28/09",
];

/**
 * La pile de badges du local technique. Un badge au nom de Farid par nuit recommencée,
 * plus celui de la première : daté du jour où il a commencé. `!` = mis en évidence.
 */
export function badgeList(loops: number): string[] {
  const farid = Array.from({ length: loops + 1 }, (_, i) => `!FARID · agent de sécurité · depuis le ${badgeDate(loops - i)}`);
  return [...FORMER_GUARDS, ...farid];
}
