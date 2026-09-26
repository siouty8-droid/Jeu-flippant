import type { ItemKey } from "../world/StoreLayout";

/** Ce que Farid a sur lui. */
export type ItemId = "photo-plan" | ItemKey | "double-froide";

export const ITEM_NAMES: Record<ItemId, string> = {
  "photo-plan": "Photo du plan d'évacuation (téléphone)",
  "cle-securite": "Clé du poste de sécurité (pastille rouge)",
  "cle-technique": "Clé du local technique (pastille bleue)",
  "cle-secours": "Clé des sorties de secours (pastille verte)",
  "cle-froide": "Clé de la chambre froide",
  "double-froide": "Double de clé « CH. FROIDE » (caisse de la boucherie)",
};

/** Le trousseau du vigile de nuit : une clé par porte. */
const TROUSSEAU: ItemId[] = ["cle-securite", "cle-technique", "cle-secours", "cle-froide"];

export class Inventory {
  private readonly items = new Set<ItemId>();

  constructor() {
    this.startNight();
  }

  has(item: ItemId): boolean {
    return this.items.has(item);
  }

  add(item: ItemId): void {
    this.items.add(item);
  }

  /** Début de nuit : juste le trousseau. */
  startNight(): void {
    this.items.clear();
    for (const k of TROUSSEAU) this.items.add(k);
  }

  list(): ItemId[] {
    return [...this.items];
  }
}
