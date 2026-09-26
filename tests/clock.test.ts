import { describe, expect, it } from "vitest";
import { EventBus } from "../src/core/EventBus";
import { GameClock } from "../src/core/GameClock";

describe("GameClock", () => {
  it("la durée de la nuit se règle (vitesse de l'horloge)", () => {
    const clock = new GameClock(new EventBus());
    clock.realSecondsPerHour = (36 * 60) / 6;
    for (let i = 0; i < 360; i++) clock.update(1);
    expect(clock.totalMinutes).toBeCloseTo(60, 5);
  });

  it("06:00 déclenche l'aube une seule fois", () => {
    const bus = new EventBus();
    let dawns = 0;
    bus.on("clock:dawn", () => dawns++);
    const clock = new GameClock(bus);
    clock.set(359.9);
    for (let i = 0; i < 100; i++) clock.update(1);
    expect(clock.format()).toBe("06:00");
    expect(dawns).toBe(1);
  });
});
