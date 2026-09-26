import { describe, expect, it } from "vitest";
import { CONFIG } from "../src/config";
import { EventBus } from "../src/core/EventBus";
import { Rng } from "../src/core/Rng";
import { DwellTracker } from "../src/systems/DwellTracker";
import { OcclusionMap, isSlotHidden, type Eye } from "../src/world/Occlusion";
import { ReshuffleSystem } from "../src/world/ReshuffleSystem";
import { HALLOWEEN_MODULE, RAYON_9, StoreLayout, type Box3 } from "../src/world/StoreLayout";

const GONDOLAS: Box3[] = [-2.4, 2.4].map((x) => ({ minX: x - 0.6, maxX: x + 0.6, minY: 0, maxY: 2.15, minZ: -4, maxZ: 4 }));
const ACTIVE = CONFIG.reshuffle.activeFromMinutes + 5;

function setup(seed = 1) {
  const layout = new StoreLayout();
  const occ = new OcclusionMap(layout);
  const place = () => layout.assignment.forEach((id, slot) => occ.setModule(id, GONDOLAS, layout.slots[slot]));
  place();
  const dwell = new DwellTracker();
  const bus = new EventBus();
  const events: { slots: number[]; cause: string }[] = [];
  bus.on("store:reshuffle", (e) => events.push(e));
  const system = new ReshuffleSystem(layout, occ, dwell, new Rng(seed), bus, () => place());
  return { layout, occ, dwell, system, events };
}

function eye(x: number, z: number, yaw: number): Eye {
  return { x, y: 1.68, z, forward: { x: Math.sin(yaw), y: 0, z: Math.cos(yaw) }, halfAngle: (67 * Math.PI) / 180 };
}

/** Fait tourner le système pendant `seconds` secondes. */
function run(system: ReshuffleSystem, seconds: number, minutes: number, e: Eye) {
  for (let t = 0; t < seconds; t += 0.05) system.update(0.05, minutes, e, { x: e.x, z: e.z });
}

describe("ReshuffleSystem", () => {
  it("ne fait rien avant 01:10", () => {
    const { layout, system, events } = setup();
    const before = [...layout.assignment];
    system.markExited(3);
    run(system, 20, 30, eye(18, 28.5, 0));
    expect(events).toHaveLength(0);
    expect(layout.assignment).toEqual(before);
  });

  it("ne touche jamais à un slot visible", () => {
    for (let seed = 1; seed <= 12; seed++) {
      const { layout, occ, system } = setup(seed);
      const e = eye(18, 28.5, 0);
      const visibleBefore = layout.slots
        .filter((s) => !isSlotHidden(e, s, layout.assignment[s.index], occ))
        .map((s) => [s.index, layout.assignment[s.index]]);
      for (const s of [0, 1, 2, 3, 5, 6, 7, 8]) system.markExited(s);
      run(system, 12, ACTIVE, e);
      for (const [slot, id] of visibleBefore) expect(layout.assignment[slot]).toBe(id);
    }
  });

  it("un rayon quitté puis caché finit par bouger (rayon jamais ancré)", () => {
    let moved = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const { system, events } = setup(seed);
      system.markExited(3);
      run(system, 2, ACTIVE, eye(18, 28.5, 0));
      if (events.some((e) => e.slots.includes(3))) moved++;
    }
    // Chance max 0,75 : sur 40 tirages, on doit en voir bouger une bonne partie.
    expect(moved).toBeGreaterThan(18);
  });

  it("un rayon très ancré bouge beaucoup moins", () => {
    let moved = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const { layout, dwell, system, events } = setup(seed);
      // 3 minutes passées dans le rayon du slot 3.
      for (let t = 0; t < 180; t += 1) dwell.update(1, 5, 5 + (t % 2) * 3, layout.assignment[3], false, 0);
      system.markExited(3);
      run(system, 2, ACTIVE, eye(18, 28.5, 0));
      if (events.some((e) => e.slots.includes(3))) moved++;
    }
    expect(moved).toBeLessThan(10);
  });

  it("la stagnation échange deux slots cachés proches", () => {
    const { dwell, system, events } = setup(7);
    const e = eye(18, 28.5, 0);
    for (let t = 0; t < 12; t += 0.05) {
      dwell.update(0.05, e.x, e.z, 3, false, ACTIVE);
      system.update(0.05, ACTIVE, e, { x: e.x, z: e.z });
    }
    expect(events.some((ev) => ev.cause === "stagnation")).toBe(true);
  });

  it("après 2h30, la stagnation reste prioritaire sur l'apparition du rayon 9", () => {
    const { dwell, system, events } = setup(3);
    const e = eye(18, 28.5, 0);
    for (let t = 0; t < 12; t += 0.05) {
      dwell.update(0.05, e.x, e.z, 3, false, 160);
      system.update(0.05, 160, e, { x: e.x, z: e.z });
    }
    expect(events.some((ev) => ev.cause === "stagnation")).toBe(true);
  });

  it("le rayon 9 remplace le présentoir Halloween après 2h30, seulement s'il est caché", () => {
    const { layout, system, events } = setup();
    const halloween = layout.slotOfModule(HALLOWEEN_MODULE);
    // Dans l'allée transversale, face au présentoir : visible, donc rien.
    run(system, 3, 160, eye(29, 34.5, 0));
    expect(layout.slotOfModule(RAYON_9)).toBe(-1);
    // Dans l'allée du slot 4, le présentoir est caché : il est remplacé.
    run(system, 3, 160, eye(18, 28.5, Math.PI));
    expect(layout.assignment[halloween]).toBe(RAYON_9);
    expect(events.some((ev) => ev.cause === "rayon9")).toBe(true);
  });
});

describe("DwellTracker", () => {
  it("le seuil de stagnation baisse au fil de la nuit", () => {
    expect(DwellTracker.threshold(70)).toBeCloseTo(8);
    expect(DwellTracker.threshold(270)).toBeCloseTo(3);
    expect(DwellTracker.threshold(170)).toBeCloseTo(5.5);
  });

  it("marcher remet la stagnation à zéro, lire le plan non", () => {
    const d = new DwellTracker();
    d.update(1, 0, 0, null, false, ACTIVE);
    d.update(1, 0.2, 0, null, false, ACTIVE);
    expect(d.stagnation).toBeGreaterThan(0.9);
    d.update(1, 5, 0, null, false, ACTIVE);
    expect(d.stagnation).toBe(0);
    d.update(1, 10, 0, null, true, ACTIVE);
    expect(d.stagnation).toBe(1);
  });
});
