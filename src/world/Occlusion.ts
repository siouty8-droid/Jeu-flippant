import type { Box3, Slot, StoreLayout } from "./StoreLayout";
import { STORE, wallPieces } from "./StoreLayout";

/**
 * Ce que le joueur peut voir, sans passer par le moteur 3D.
 *
 * Le magasin n'est fait que de boîtes alignées sur les axes (murs, gondoles, frigos) :
 * on teste des segments œil → point contre ces boîtes (méthode des slabs).
 * C'est rapide, déterministe et testable hors navigateur.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Eye extends Vec3 {
  /** Direction du regard, normalisée. */
  forward: Vec3;
  /** Demi-angle du cône de vision (radians), marge comprise. */
  halfAngle: number;
}

interface OwnedBox extends Box3 {
  /** Module propriétaire, ou null pour le décor fixe. */
  owner: number | null;
}

export class OcclusionMap {
  private readonly staticBoxes: OwnedBox[] = [];
  private readonly moduleBoxes = new Map<number, OwnedBox[]>();
  /** Volumes qui apparaissent et disparaissent (portes fermées). */
  private readonly dynamicBoxes = new Map<string, OwnedBox>();

  constructor(layout: StoreLayout, extraStatic: Box3[] = []) {
    for (const wall of layout.walls) {
      for (const p of wallPieces(wall)) if (!p.glass) this.staticBoxes.push({ ...p, owner: null });
    }
    for (const b of extraStatic) this.staticBoxes.push({ ...b, owner: null });
  }

  /** Place les volumes d'un module (coordonnées locales) au centre d'un slot, ou le retire (slot = null). */
  setModule(moduleId: number, localBoxes: readonly Box3[], slot: Slot | null): void {
    if (!slot) {
      this.moduleBoxes.delete(moduleId);
      return;
    }
    this.moduleBoxes.set(
      moduleId,
      localBoxes.map((b) => ({
        minX: b.minX + slot.cx,
        maxX: b.maxX + slot.cx,
        minY: b.minY,
        maxY: b.maxY,
        minZ: b.minZ + slot.cz,
        maxZ: b.maxZ + slot.cz,
        owner: moduleId,
      })),
    );
  }

  /** Ajoute ou retire (null) un volume dynamique, par exemple une porte fermée. */
  setDynamic(key: string, box: Box3 | null): void {
    if (box) this.dynamicBoxes.set(key, { ...box, owner: null });
    else this.dynamicBoxes.delete(key);
  }

  /** Vrai si un volume (autre que ceux du module `ignoreOwner`) coupe le segment a → b. */
  blocked(a: Vec3, b: Vec3, ignoreOwner: number | null = null): boolean {
    for (const box of this.staticBoxes) if (segmentHitsBox(a, b, box)) return true;
    for (const box of this.dynamicBoxes.values()) if (segmentHitsBox(a, b, box)) return true;
    for (const [owner, boxes] of this.moduleBoxes) {
      if (owner === ignoreOwner) continue;
      for (const box of boxes) if (segmentHitsBox(a, b, box)) return true;
    }
    return false;
  }
}

/** Test segment / boîte, en excluant les extrémités (un point posé sur une surface n'est pas masqué par elle). */
export function segmentHitsBox(a: Vec3, b: Vec3, box: Box3): boolean {
  const eps = 1e-4;
  let tMin = eps;
  let tMax = 1 - eps;
  const axes: [number, number, number, number][] = [
    [a.x, b.x - a.x, box.minX, box.maxX],
    [a.y, b.y - a.y, box.minY, box.maxY],
    [a.z, b.z - a.z, box.minZ, box.maxZ],
  ];
  for (const [origin, dir, lo, hi] of axes) {
    if (Math.abs(dir) < 1e-9) {
      if (origin <= lo || origin >= hi) return false;
      continue;
    }
    let t1 = (lo - origin) / dir;
    let t2 = (hi - origin) / dir;
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tMin) tMin = t1;
    if (t2 < tMax) tMax = t2;
    if (tMin >= tMax) return false;
  }
  return true;
}

/** Points d'échantillonnage d'un slot : gondoles, allée, panneaux suspendus aux deux bouts. */
export function slotSamplePoints(slot: Slot): Vec3[] {
  const pts: Vec3[] = [];
  for (const x of [slot.cx - 2.4, slot.cx, slot.cx + 2.4]) {
    for (const z of [slot.z0 + 0.5, slot.cz, slot.z1 - 0.5]) {
      for (const y of [0.5, 1.9]) pts.push({ x, y, z });
    }
  }
  for (const z of [slot.z0 - 0.1, slot.z1 + 0.1]) {
    for (const dx of [-1.1, 0, 1.1]) for (const y of [2.85, 3.35]) pts.push({ x: slot.cx + dx, y, z });
  }
  return pts;
}

/** Coins de la boîte englobante d'un slot, panneaux compris. */
function slotCorners(slot: Slot): Vec3[] {
  const out: Vec3[] = [];
  for (const x of [slot.x0, slot.x1]) for (const z of [slot.z0 - 0.2, slot.z1 + 0.2]) for (const y of [0, STORE.height - 0.6]) out.push({ x, y, z });
  return out;
}

function inCone(eye: Eye, p: Vec3): boolean {
  const dx = p.x - eye.x;
  const dy = p.y - eye.y;
  const dz = p.z - eye.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 0.001) return true;
  const cos = (dx * eye.forward.x + dy * eye.forward.y + dz * eye.forward.z) / len;
  return cos > Math.cos(eye.halfAngle);
}

export interface SlotVisibility {
  inView: boolean;
  lineOfSight: boolean;
}

function anySampleVisible(from: Vec3, samples: Vec3[], moduleId: number, occ: OcclusionMap): boolean {
  for (const p of samples) if (!occ.blocked(from, p, moduleId)) return true;
  return false;
}

export function slotVisibility(eye: Eye, slot: Slot, moduleId: number, occ: OcclusionMap): SlotVisibility {
  const samples = slotSamplePoints(slot);
  const inView = slotCorners(slot).some((c) => inCone(eye, c)) || samples.some((p) => inCone(eye, p));
  return { inView, lineOfSight: anySampleVisible(eye, samples, moduleId, occ) };
}

/**
 * Un slot est « caché » quand aucun de ses points n'est en ligne de vue.
 * S'il est dans le cône de vision (derrière une gondole, par exemple), on est plus exigeant :
 * il doit aussi être masqué depuis des positions de tête décalées (±30 cm, +10 cm), pour
 * qu'un pas de côté ne révèle jamais un rayon en train de changer. Au moindre doute : visible.
 */
/** Décalages latéraux / verticaux de la tête testés quand le slot est dans le cône (> balancement de tête max). */
const HEAD_OFFSETS: readonly [number, number][] = [[-0.3, 0], [0.3, 0], [0, 0.1], [-0.3, 0.1], [0.3, 0.1]];

export function isSlotHidden(eye: Eye, slot: Slot, moduleId: number, occ: OcclusionMap): boolean {
  const samples = slotSamplePoints(slot);
  if (anySampleVisible(eye, samples, moduleId, occ)) return false;
  const inView = slotCorners(slot).some((c) => inCone(eye, c)) || samples.some((p) => inCone(eye, p));
  if (!inView) return true;
  const rx = eye.forward.z;
  const rz = -eye.forward.x;
  const rl = Math.hypot(rx, rz) || 1;
  for (const [side, up] of HEAD_OFFSETS) {
    const head = { x: eye.x + (rx / rl) * side, y: eye.y + up, z: eye.z + (rz / rl) * side };
    if (anySampleVisible(head, samples, moduleId, occ)) return false;
  }
  return true;
}
