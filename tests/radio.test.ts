import { describe, expect, it } from "vitest";
import { composeTrack } from "../src/audio/Muzak";
import { RadioDirector } from "../src/systems/RadioDirector";
import { StoreLayout } from "../src/world/StoreLayout";

describe("Muzak", () => {
  it("un même morceau sonne pareil à chaque fois (seedé)", () => {
    expect(composeTrack("a", 42, "normal")).toEqual(composeTrack("a", 42, "normal"));
    expect(composeTrack("a", 42, "normal").notes).not.toEqual(composeTrack("a", 43, "normal").notes);
  });

  it("les morceaux inconnus sont plus lents, mineurs et plus désaccordés", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const normal = composeTrack("n", seed, "normal");
      const unknown = composeTrack("u", seed, "unknown");
      expect(unknown.bpm).toBeLessThan(normal.bpm);
      expect(unknown.minor).toBe(true);
      expect(unknown.detuneCents).toBeGreaterThan(normal.detuneCents);
      // Même instrumentation.
      expect(new Set(unknown.notes.map((n) => n.inst))).toEqual(new Set(normal.notes.map((n) => n.inst)));
    }
  });

  it("mode majeur pour les morceaux connus, mineur avec des fausses notes pour les inconnus", () => {
    let wrong = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const normal = composeTrack("n", seed, "normal");
      const unknown = composeTrack("u", seed, "unknown");
      expect(normal.scale[2]).toBe(4);
      expect(unknown.scale[2]).toBe(3);
      const inScale = (t: typeof normal, midi: number) => t.scale.includes((((midi - t.root) % 12) + 12) % 12);
      // Toute la mélodie d'un morceau connu est dans la gamme.
      for (const n of normal.notes.filter((n) => n.inst === "lead")) expect(inScale(normal, n.midi)).toBe(true);
      wrong += unknown.notes.filter((n) => n.inst === "lead" && !inScale(unknown, n.midi)).length;
    }
    // Les inconnus ont des intervalles de travers.
    expect(wrong).toBeGreaterThan(10);
  });

  it("toutes les notes tiennent dans la boucle", () => {
    const t = composeTrack("b", 7, "normal");
    for (const n of t.notes) {
      expect(n.beat).toBeGreaterThanOrEqual(0);
      expect(n.beat).toBeLessThan(t.beats);
    }
  });
});

describe("RadioDirector", () => {
  it("chaque rayon du plan a son morceau, et les 8 sont différents", () => {
    const layout = new StoreLayout();
    const radio = new RadioDirector(layout);
    const tracks = new Set(layout.slots.filter((s) => layout.initialAssignment[s.index] !== 0).map((s) => radio.trackOfSlot(s.index)));
    expect(tracks.size).toBe(8);
  });

  it("un emplacement réagencé passe un morceau inconnu", () => {
    const layout = new StoreLayout();
    const radio = new RadioDirector(layout);
    const s = layout.slots[4];
    expect(radio.choose(s.cx, s.cz, "slot-4", false)).toMatchObject({ kind: "normal", slot: 4 });
    [layout.assignment[4], layout.assignment[0]] = [layout.assignment[0], layout.assignment[4]];
    const c = radio.choose(s.cx, s.cz, "slot-4", false);
    expect(c.kind).toBe("unknown");
    expect(c.track).toMatch(/^inconnu-4-/);
  });

  it("dans une allée, on entend l'emplacement le plus proche, avec de l'hystérésis", () => {
    const layout = new StoreLayout();
    const radio = new RadioDirector(layout);
    // Allée longitudinale x = 12.5, entre la colonne 0 (x 4-10) et la colonne 1 (x 15-21).
    expect(radio.choose(11, 16.5, "allee", false).slot).toBe(0);
    // Un peu plus près de la colonne 1, mais pas assez pour changer.
    expect(radio.choose(12.9, 16.5, "allee", false).slot).toBe(0);
    expect(radio.choose(14.5, 16.5, "allee", false).slot).toBe(1);
  });

  it("silence dans la chambre froide, son étouffé dans la réserve, boucle inconnue entre 04:00 et 05:00", () => {
    const layout = new StoreLayout();
    const radio = new RadioDirector(layout);
    expect(radio.choose(10, 54, "froide", false).track).toBeNull();
    expect(radio.choose(25, 54, "reserve", false).muffle).toBeGreaterThan(0.4);
    expect(radio.choose(18, 28, "slot-4", true)).toMatchObject({ track: "inconnu-boucle", kind: "unknown" });
  });
});
