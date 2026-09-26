import { describe, expect, it } from "vitest";
import { ReplayBuffer, cameraDelay, type Snapshot } from "../src/systems/ReplayBuffer";

function snap(t: number, x = t): Snapshot {
  return { t, assignment: [1, 2, 3], player: { x, z: 0, yaw: 0 }, shopper: null, neons: new Uint8Array(2), actors: [] };
}

describe("cameraDelay", () => {
  it("reste entre 2 et 4 minutes et n'est pas constant", () => {
    const values = Array.from({ length: 360 }, (_, m) => cameraDelay(m));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(2 - 1e-9);
    expect(Math.max(...values)).toBeLessThanOrEqual(4 + 1e-9);
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(1.5);
  });
});

describe("ReplayBuffer", () => {
  it("interpole entre deux instantanés", () => {
    const b = new ReplayBuffer();
    for (let t = 0; t <= 1; t += 0.05) b.push(snap(+t.toFixed(2)));
    const s = b.at(0.525)!;
    expect(s.player.x).toBeCloseTo(0.525, 3);
  });

  it("pas de signal avant le début de l'enregistrement ou dans un trou", () => {
    const b = new ReplayBuffer();
    b.push(snap(10));
    b.push(snap(10.1));
    b.push(snap(13));
    expect(b.at(9)).toBeNull();
    expect(b.at(12)).toBeNull();
    expect(b.at(10.05)).not.toBeNull();
  });

  it("oublie ce qui est trop vieux et ce qui suit un retour en arrière", () => {
    const b = new ReplayBuffer();
    for (let t = 0; t <= 10; t += 0.1) b.push(snap(+t.toFixed(1)));
    expect(b.oldest).toBeGreaterThanOrEqual(4 - 1e-9);
    b.push(snap(0));
    expect(b.length).toBe(1);
  });
});
