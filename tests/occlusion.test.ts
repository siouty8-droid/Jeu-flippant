import { describe, expect, it } from "vitest";
import { OcclusionMap, isSlotHidden, segmentHitsBox, slotVisibility, type Eye } from "../src/world/Occlusion";
import { StoreLayout, type Box3 } from "../src/world/StoreLayout";

/** Volumes locaux d'un rayon standard : deux gondoles de 2,15 m. */
const GONDOLAS: Box3[] = [-2.4, 2.4].map((x) => ({ minX: x - 0.6, maxX: x + 0.6, minY: 0, maxY: 2.15, minZ: -4, maxZ: 4 }));

function setup() {
  const layout = new StoreLayout();
  const occ = new OcclusionMap(layout);
  layout.assignment.forEach((id, slot) => occ.setModule(id, GONDOLAS, layout.slots[slot]));
  return { layout, occ };
}

function eye(x: number, z: number, yaw: number): Eye {
  return { x, y: 1.68, z, forward: { x: Math.sin(yaw), y: 0, z: Math.cos(yaw) }, halfAngle: (67 * Math.PI) / 180 };
}

describe("segmentHitsBox", () => {
  const box = { minX: 0, maxX: 1, minY: 0, maxY: 1, minZ: 0, maxZ: 1 };
  it("détecte un segment qui traverse", () => {
    expect(segmentHitsBox({ x: -1, y: 0.5, z: 0.5 }, { x: 2, y: 0.5, z: 0.5 }, box)).toBe(true);
  });
  it("ignore un segment qui passe à côté", () => {
    expect(segmentHitsBox({ x: -1, y: 1.5, z: 0.5 }, { x: 2, y: 1.5, z: 0.5 }, box)).toBe(false);
  });
  it("ignore un segment qui s'arrête avant", () => {
    expect(segmentHitsBox({ x: -2, y: 0.5, z: 0.5 }, { x: -0.5, y: 0.5, z: 0.5 }, box)).toBe(false);
  });
});

describe("visibilité des slots", () => {
  it("dans l'allée du rayon central, les rayons de côté sont cachés", () => {
    const { layout, occ } = setup();
    // Slot 4 (centre) : x 15..21, z 24..33. On regarde vers le fond (+z).
    const e = eye(18, 28.5, 0);
    for (const side of [3, 5]) {
      expect(isSlotHidden(e, layout.slots[side], layout.assignment[side], occ)).toBe(true);
    }
  });

  it("à travers la double porte de la réserve, on voit le magasin", () => {
    const { layout, occ } = setup();
    const e = eye(34, 57, 0);
    // Le slot 6 (surgelés) est dans l'axe de la porte.
    expect(slotVisibility(e, layout.slots[6], layout.assignment[6], occ).lineOfSight).toBe(true);
  });

  it("le rayon droit devant n'est jamais caché", () => {
    const { layout, occ } = setup();
    const e = eye(18, 28.5, 0);
    expect(isSlotHidden(e, layout.slots[7], layout.assignment[7], occ)).toBe(false);
  });

  it("un rayon derrière soi mais en ligne de vue directe reste visible", () => {
    const { layout, occ } = setup();
    // Dans l'allée du slot 4, dos au slot 1 qui est dans l'axe de l'allée.
    const e = eye(18, 28.5, 0);
    const v = slotVisibility(e, layout.slots[1], layout.assignment[1], occ);
    expect(v.inView).toBe(false);
    expect(v.lineOfSight).toBe(true);
  });

  it("depuis la réserve, la surface de vente est derrière le mur", () => {
    const { layout, occ } = setup();
    // Coin de la réserve contre le mur du magasin, loin de la double porte.
    const e = eye(34, 50.5, 0);
    for (const s of [0, 1, 2, 3, 4]) expect(isSlotHidden(e, layout.slots[s], layout.assignment[s], occ)).toBe(true);
  });
});
