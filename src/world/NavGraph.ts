import { HALLOWEEN_MODULE, type StoreLayout } from "./StoreLayout";

/**
 * Graphe de déplacement du client : les allées transversales, les allées longitudinales
 * entre les colonnes de rayons, et le milieu de chaque allée de rayon.
 * Les gondoles sont toujours au même endroit quel que soit le rayon, donc le graphe
 * ne change jamais ; seule l'allée du présentoir Halloween (encombrée) est évitée.
 */

export interface NavNode {
  id: number;
  x: number;
  z: number;
  /** Nœud au milieu d'une allée de rayon : le slot correspondant. */
  slot?: number;
}

/** Allées transversales (z) et longitudinales (x) de la surface de vente. */
export const CROSS_Z = [10.5, 22.5, 34.5, 47] as const;
export const CORRIDOR_X = [2, 12.5, 23.5, 34] as const;

export class NavGraph {
  readonly nodes: NavNode[] = [];
  private readonly adj = new Map<number, number[]>();
  /** Fin de nuit : allées que le client évite tant qu'elles sont comme sur le plan (le chemin sûr). */
  readonly avoidStable = new Set<number>();

  constructor(private readonly layout: StoreLayout) {
    const aisleX = [...new Set(layout.slots.map((s) => s.cx))];
    const xs = [...CORRIDOR_X, ...aisleX].sort((a, b) => a - b);
    const grid = new Map<string, number>();
    const add = (x: number, z: number, slot?: number) => {
      const id = this.nodes.length;
      this.nodes.push({ id, x, z, slot });
      this.adj.set(id, []);
      return id;
    };
    const key = (x: number, z: number) => `${x}:${z}`;

    for (const z of CROSS_Z) for (const x of xs) grid.set(key(x, z), add(x, z));
    // Allées transversales.
    for (const z of CROSS_Z) for (let i = 0; i + 1 < xs.length; i++) this.link(grid.get(key(xs[i], z))!, grid.get(key(xs[i + 1], z))!);
    // Allées longitudinales.
    for (const x of CORRIDOR_X) for (let i = 0; i + 1 < CROSS_Z.length; i++) this.link(grid.get(key(x, CROSS_Z[i]))!, grid.get(key(x, CROSS_Z[i + 1]))!);
    // Milieu des allées de rayon, relié aux deux allées transversales.
    for (const slot of layout.slots) {
      const mid = add(slot.cx, slot.cz, slot.index);
      const below = CROSS_Z.filter((z) => z < slot.z0).at(-1)!;
      const above = CROSS_Z.find((z) => z > slot.z1)!;
      this.link(mid, grid.get(key(slot.cx, below))!);
      this.link(mid, grid.get(key(slot.cx, above))!);
    }
  }

  private link(a: number, b: number): void {
    this.adj.get(a)!.push(b);
    this.adj.get(b)!.push(a);
  }

  neighbors(id: number): number[] {
    return this.adj.get(id) ?? [];
  }

  /** L'allée de ce nœud est-elle praticable avec le magasin tel qu'il est maintenant ? */
  walkable(id: number): boolean {
    const slot = this.nodes[id].slot;
    if (slot === undefined) return true;
    const module = this.layout.assignment[slot];
    if (this.avoidStable.has(slot) && module === this.layout.initialAssignment[slot]) return false;
    return module !== HALLOWEEN_MODULE;
  }

  /** Nœud praticable le plus proche qui passe le filtre (sans filtre si aucun ne passe). */
  nearest(x: number, z: number, filter: (n: NavNode) => boolean = () => true): NavNode {
    let best: NavNode | null = null;
    let bestD = Infinity;
    for (const n of this.nodes) {
      if (!filter(n) || !this.walkable(n.id)) continue;
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best ?? this.nearest(x, z);
  }

  /** A* ; renvoie la liste des nœuds de `from` à `to` inclus, ou [] si inaccessible. */
  path(from: number, to: number): number[] {
    if (from === to) return [from];
    const h = (id: number) => Math.hypot(this.nodes[id].x - this.nodes[to].x, this.nodes[id].z - this.nodes[to].z);
    const g = new Map<number, number>([[from, 0]]);
    const came = new Map<number, number>();
    const open = new Set<number>([from]);
    while (open.size > 0) {
      let current = -1;
      let bestF = Infinity;
      for (const id of open) {
        const f = g.get(id)! + h(id);
        if (f < bestF) {
          bestF = f;
          current = id;
        }
      }
      if (current === to) {
        const out = [to];
        while (came.has(out[0])) out.unshift(came.get(out[0])!);
        return out;
      }
      open.delete(current);
      for (const next of this.neighbors(current)) {
        if (!this.walkable(next) && next !== to) continue;
        const a = this.nodes[current];
        const b = this.nodes[next];
        const cost = g.get(current)! + Math.hypot(a.x - b.x, a.z - b.z);
        if (cost < (g.get(next) ?? Infinity)) {
          g.set(next, cost);
          came.set(next, current);
          open.add(next);
        }
      }
    }
    return [];
  }
}
