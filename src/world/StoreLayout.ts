/**
 * Modèle logique du magasin, indépendant de la 3D.
 *
 * Repère : x vers la droite quand on entre, z vers le fond du magasin, y vers le haut.
 * L'entrée est en z = 0. Unité : le mètre.
 *
 * Les rayons vivent dans une grille de 3×3 emplacements (« slots »). Un slot contient
 * un module (un rayon, ou le présentoir Halloween qui occupe l'emplacement vide).
 * Le réagencement (règle 1) ne fera que changer quel module est dans quel slot :
 * la géométrie des slots, des murs et des pièces ne bouge jamais.
 */

export type FixtureStyle = "shelf" | "produce" | "bakery" | "fridge" | "butcher" | "display";

export interface ModuleDef {
  /** 1..9 pour les rayons, 0 pour le présentoir Halloween. */
  id: number;
  name: string;
  style: FixtureStyle;
  palette: string[];
  /** Apparaît sur le plan d'évacuation. */
  onPlan: boolean;
}

export const HALLOWEEN_MODULE = 0;
export const RAYON_9 = 9;

export const MODULES: readonly ModuleDef[] = [
  { id: 0, name: "Promo Halloween", style: "display", palette: ["#e8741c", "#f29a2e", "#2b2b2b", "#6b3fa0"], onPlan: false },
  { id: 1, name: "Fruits et légumes", style: "produce", palette: ["#5a9e3a", "#c8342b", "#e8a13a", "#e8d43a", "#7b3f8c", "#3f7a2a", "#9ccf4a"], onPlan: true },
  { id: 2, name: "Boulangerie", style: "bakery", palette: ["#d9a55b", "#b87a3a", "#f0d9a8", "#8a5a2b", "#e8c07a", "#c98f4a"], onPlan: true },
  { id: 3, name: "Conserves", style: "shelf", palette: ["#b33a3a", "#c9c9c9", "#3a6fb3", "#d9b23a", "#2f8f5a", "#e0e0d0", "#7a3a8c"], onPlan: true },
  { id: 4, name: "Épicerie", style: "shelf", palette: ["#e8c23a", "#c8342b", "#3a8fd9", "#f2f2e6", "#6b4a2b", "#e87a2e", "#4aa04a"], onPlan: true },
  { id: 5, name: "Surgelés", style: "fridge", palette: ["#9fd4ff", "#ffffff", "#3a7bd5", "#c8342b", "#e8d43a"], onPlan: true },
  { id: 6, name: "Boucherie", style: "butcher", palette: ["#b3303a", "#e07a7a", "#f2e6e0", "#8c1f28", "#d95a5a"], onPlan: true },
  { id: 7, name: "Produits ménagers", style: "shelf", palette: ["#3aa0d9", "#f2f2f2", "#e84a8a", "#6ad94a", "#f2d23a", "#8a4ad9"], onPlan: true },
  { id: 8, name: "Boissons", style: "shelf", palette: ["#2a6e3a", "#c8342b", "#f2f2f2", "#1f3f8c", "#e8a13a", "#6b2a1f", "#1a1a1a"], onPlan: true },
  { id: 9, name: "", style: "shelf", palette: ["#8a8a80", "#9a948a", "#7a7a74", "#a8a498", "#6e6a62"], onPlan: false },
];

export function moduleDef(id: number): ModuleDef {
  const def = MODULES.find((m) => m.id === id);
  if (!def) throw new Error(`Module inconnu : ${id}`);
  return def;
}

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export interface Slot extends Rect {
  index: number;
  row: number;
  col: number;
  cx: number;
  cz: number;
}

export interface Room extends Rect {
  id: string;
  name: string;
}

export type WallMaterial = "store" | "back" | "cold" | "office";

export interface Opening {
  /** Début et fin le long du mur. */
  from: number;
  to: number;
  bottom: number;
  top: number;
  glass?: boolean;
}

/** Mur aligné sur un axe : de (x0,z0) à (x1,z1), avec x0 === x1 ou z0 === z1. */
export interface Wall {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  material: WallMaterial;
  openings: Opening[];
}

/** Boîte alignée sur les axes, en coordonnées monde (ou locales pour un module). */
export interface Box3 {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export interface WallPiece extends Box3 {
  glass: boolean;
}

/** Découpe un mur en blocs pleins (et vitres) autour de ses ouvertures. Sert à la 3D et à l'occlusion. */
export function wallPieces(wall: Wall): WallPiece[] {
  const H = STORE.height;
  const t = STORE.wallThickness / 2;
  const alongX = wall.z0 === wall.z1;
  const start = alongX ? wall.x0 : wall.z0;
  const end = alongX ? wall.x1 : wall.z1;
  const out: WallPiece[] = [];
  const piece = (a: number, b: number, y0: number, y1: number, glass = false) => {
    if (b - a <= 0.001 || y1 - y0 <= 0.001) return;
    out.push(
      alongX
        ? { minX: a, maxX: b, minY: y0, maxY: y1, minZ: wall.z0 - t, maxZ: wall.z0 + t, glass }
        : { minX: wall.x0 - t, maxX: wall.x0 + t, minY: y0, maxY: y1, minZ: a, maxZ: b, glass },
    );
  };
  let cursor = start;
  for (const o of [...wall.openings].sort((a, b) => a.from - b.from)) {
    piece(cursor, o.from, 0, H);
    piece(o.from, o.to, 0, o.bottom);
    piece(o.from, o.to, o.top, H);
    if (o.glass) piece(o.from, o.to, o.bottom, o.top, true);
    cursor = o.to;
  }
  piece(cursor, end, 0, H);
  return out;
}

export type DoorKind = "emergency" | "room" | "entrance";

export interface DoorDef {
  id: string;
  kind: DoorKind;
  label: string;
  /** Centre de l'ouverture au sol. */
  x: number;
  z: number;
  /** Axe le long duquel court le mur qui porte la porte. */
  wallAxis: "x" | "z";
  width: number;
  height: number;
}

export interface Zone {
  id: string;
  label: string;
  slot?: number;
}

export const STORE = {
  width: 36,
  /** Profondeur de la surface de vente (mur du fond en z = 49). */
  salesDepth: 49,
  /** Profondeur totale, réserve comprise. */
  depth: 59,
  height: 4.2,
  wallThickness: 0.2,
  doorHeight: 2.2,
  cellWidth: 6,
  cellDepth: 9,
  colX: [4, 15, 26] as const,
  rowZ: [12, 24, 36] as const,
} as const;

/** Rayons dans l'ordre des slots (rangée avant → fond, gauche → droite). */
const INITIAL_ASSIGNMENT = [1, 4, 7, 2, 3, 8, 5, 6, HALLOWEEN_MODULE];

export class StoreLayout {
  readonly slots: Slot[] = [];
  readonly rooms: Room[];
  readonly walls: Wall[];
  readonly doors: DoorDef[];
  /** Plan « d'avant minuit », ce qu'affiche le plan d'évacuation. Jamais modifié. */
  readonly initialAssignment: readonly number[] = INITIAL_ASSIGNMENT;
  /** Quel module est dans quel slot en ce moment. */
  assignment: number[] = [...INITIAL_ASSIGNMENT];
  /** Heure de jeu (minutes) du dernier changement de contenu de chaque slot, -1 si jamais. */
  readonly slotChangedAt: number[] = INITIAL_ASSIGNMENT.map(() => -1);

  constructor() {
    for (let row = 0; row < STORE.rowZ.length; row++) {
      for (let col = 0; col < STORE.colX.length; col++) {
        const x0 = STORE.colX[col];
        const z0 = STORE.rowZ[row];
        const x1 = x0 + STORE.cellWidth;
        const z1 = z0 + STORE.cellDepth;
        this.slots.push({ index: this.slots.length, row, col, x0, z0, x1, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 });
      }
    }

    // L'ordre compte pour zoneAt : les pièces les plus précises d'abord.
    this.rooms = [
      { id: "securite", name: "Poste de sécurité", x0: 0, z0: 0, x1: 6, z1: 6 },
      { id: "entree", name: "Entrée / caisses", x0: 0, z0: 0, x1: STORE.width, z1: 9 },
      { id: "technique", name: "Local technique", x0: 0, z0: 49, x1: 7, z1: 59 },
      { id: "froide", name: "Chambre froide", x0: 7, z0: 49, x1: 14, z1: 59 },
      { id: "reserve", name: "Réserve", x0: 14, z0: 49, x1: 36, z1: 59 },
    ];

    const D = STORE.doorHeight;
    this.walls = [
      // Façade : vitrines, pilier du plan d'évacuation, portes automatiques.
      {
        x0: 0, z0: 0, x1: 36, z1: 0, material: "store",
        openings: [
          { from: 7, to: 14.5, bottom: 0.5, top: 3.1, glass: true },
          { from: 16, to: 20, bottom: 0, top: 2.6, glass: false },
          { from: 21.5, to: 35, bottom: 0.5, top: 3.1, glass: true },
        ],
      },
      // Côtés de la surface de vente, avec une porte de secours chacun.
      { x0: 0, z0: 0, x1: 0, z1: 49, material: "store", openings: [{ from: 27.9, to: 29.1, bottom: 0, top: D }] },
      { x0: 36, z0: 0, x1: 36, z1: 49, material: "store", openings: [{ from: 27.9, to: 29.1, bottom: 0, top: D }] },
      // Mur du fond : porte du local technique, double porte de la réserve.
      {
        x0: 0, z0: 49, x1: 36, z1: 49, material: "store",
        openings: [
          { from: 3, to: 4.2, bottom: 0, top: D },
          { from: 22, to: 25, bottom: 0, top: 2.6 },
        ],
      },
      // Arrière-boutique.
      { x0: 0, z0: 49, x1: 0, z1: 59, material: "back", openings: [] },
      { x0: 36, z0: 49, x1: 36, z1: 59, material: "back", openings: [] },
      { x0: 0, z0: 59, x1: 36, z1: 59, material: "back", openings: [{ from: 30, to: 31.2, bottom: 0, top: D }] },
      // Cloison local technique / chambre froide (mitoyenne, pas de porte).
      { x0: 7, z0: 49, x1: 7, z1: 59, material: "cold", openings: [] },
      // Chambre froide / réserve : la porte de la chambre froide donne sur la réserve.
      { x0: 14, z0: 49, x1: 14, z1: 59, material: "cold", openings: [{ from: 53, to: 54.3, bottom: 0, top: D }] },
      // Poste de sécurité : porte côté magasin, vitre sur les caisses.
      { x0: 6, z0: 0, x1: 6, z1: 6, material: "office", openings: [{ from: 3.4, to: 4.5, bottom: 0, top: D }] },
      { x0: 0, z0: 6, x1: 6, z1: 6, material: "office", openings: [{ from: 1.5, to: 4.5, bottom: 1.0, top: 2.1, glass: true }] },
    ];

    this.doors = [
      { id: "secours-ouest", kind: "emergency", label: "Sortie de secours (côté boulangerie)", x: 0, z: 28.5, wallAxis: "z", width: 1.2, height: D },
      { id: "secours-est", kind: "emergency", label: "Sortie de secours (côté boissons)", x: 36, z: 28.5, wallAxis: "z", width: 1.2, height: D },
      { id: "secours-reserve", kind: "emergency", label: "Sortie de secours (réserve)", x: 30.6, z: 59, wallAxis: "x", width: 1.2, height: D },
      { id: "entree", kind: "entrance", label: "Entrée", x: 18, z: 0, wallAxis: "x", width: 4, height: 2.6 },
      { id: "technique", kind: "room", label: "Local technique", x: 3.6, z: 49, wallAxis: "x", width: 1.2, height: D },
      { id: "reserve", kind: "room", label: "Réserve", x: 23.5, z: 49, wallAxis: "x", width: 3, height: 2.6 },
      { id: "froide", kind: "room", label: "Chambre froide", x: 14, z: 53.65, wallAxis: "z", width: 1.3, height: D },
      { id: "securite", kind: "room", label: "Poste de sécurité", x: 6, z: 3.95, wallAxis: "z", width: 1.1, height: D },
    ];
  }

  slotAt(x: number, z: number): Slot | null {
    for (const s of this.slots) {
      if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) return s;
    }
    return null;
  }

  /** Voisins directs dans la grille (4-connexité). */
  neighbors(slotIndex: number): number[] {
    const s = this.slots[slotIndex];
    const out: number[] = [];
    for (const other of this.slots) {
      if (Math.abs(other.row - s.row) + Math.abs(other.col - s.col) === 1) out.push(other.index);
    }
    return out;
  }

  slotOfModule(moduleId: number): number {
    return this.assignment.indexOf(moduleId);
  }

  moduleInSlot(slotIndex: number): ModuleDef {
    return moduleDef(this.assignment[slotIndex]);
  }

  zoneAt(x: number, z: number): Zone {
    for (const r of this.rooms) {
      if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return { id: r.id, label: r.name };
    }
    const slot = this.slotAt(x, z);
    if (slot) {
      const def = this.moduleInSlot(slot.index);
      const label = def.id === HALLOWEEN_MODULE ? def.name : def.id === RAYON_9 ? "Rayon 9" : `Rayon ${def.id} · ${def.name}`;
      return { id: `slot-${slot.index}`, label, slot: slot.index };
    }
    if (z > STORE.salesDepth || z < 0 || x < 0 || x > STORE.width) return { id: "dehors", label: "Dehors" };
    return { id: "allee", label: "Allée" };
  }
}
