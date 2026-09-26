/** Ce que Farid a sur lui. Les clés arriveront à l'étape 5. */
export type ItemId = "photo-plan";

export class Inventory {
  private readonly items = new Set<ItemId>();

  has(item: ItemId): boolean {
    return this.items.has(item);
  }

  add(item: ItemId): void {
    this.items.add(item);
  }
}
