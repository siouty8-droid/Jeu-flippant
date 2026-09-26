import { NullEngine, Scene, StandardMaterial } from "@babylonjs/core";
import { describe, expect, it } from "vitest";
import { AudioEngine } from "../src/audio/AudioEngine";
import { Rng } from "../src/core/Rng";
import { Narrative, type NarrativeContext } from "../src/narrative/Narrative";
import { Talkie } from "../src/narrative/Talkie";
import { NpcSystem } from "../src/systems/Npcs";
import type { Hud } from "../src/ui/Hud";
import { DoorSystem } from "../src/world/Doors";
import type { Materials } from "../src/world/Materials";
import { NavGraph } from "../src/world/NavGraph";
import { OcclusionMap } from "../src/world/Occlusion";
import { StoreLayout } from "../src/world/StoreLayout";

function setup() {
  const scene = new Scene(new NullEngine());
  const layout = new StoreLayout();
  const occ = new OcclusionMap(layout);
  const audio = new AudioEngine();
  const mats = new Proxy({}, { get: (_, key) => new StandardMaterial(String(key), scene) }) as Materials;
  const doors = new DoorSystem(scene, mats, layout, occ, audio);
  const npcs = new NpcSystem(scene, new NavGraph(layout), new Rng(2));
  const lines: string[] = [];
  const hud = { showLine: (_s: string | null, text: string) => lines.push(text) } as unknown as Hud;
  const talkie = new Talkie(audio, hud, new Rng(3), () => narrative.weakness, () => ({ x: 0, y: 0, z: 0 }));
  const narrative: Narrative = new Narrative(audio, talkie, npcs, doors, new Rng(4));
  narrative.reset(0);
  return { narrative, doors, npcs, talkie, lines };
}

function ctx(minutes: number, over: Partial<NarrativeContext> = {}): NarrativeContext {
  return {
    minutes,
    player: { x: 18, z: 2 },
    zoneId: "entree",
    loops: 0,
    hasPhoto: false,
    shopperActive: false,
    shopperState: "inactive",
    shopperDistance: Infinity,
    shopperInSight: false,
    neonAbove: "white",
    coldDoorSeen: false,
    ...over,
  };
}

/** Avance le temps : 9 s réelles = 1 minute de jeu. */
function run(s: ReturnType<typeof setup>, from: number, to: number, over: Partial<NarrativeContext> = {}) {
  for (let m = from; m < to; m += 0.1 / 9) {
    s.narrative.update(0.1, ctx(m, over));
    s.talkie.update(0.1);
  }
}

describe("Narrative", () => {
  it("Sabine part à 01:05 et la porte se verrouille quand personne ne regarde", () => {
    const s = setup();
    run(s, 0, 64);
    expect(s.narrative.locked).toBe(false);
    expect(s.npcs.sabine.x).toBeCloseTo(24);
    run(s, 64, 72);
    expect(s.narrative.locked).toBe(true);
    expect(s.doors.get("froide").bolted).toBe(true);
    // Sabine est bien dans la chambre froide.
    expect(s.npcs.sabine.x).toBeLessThan(14);
    expect(s.lines.some((l) => l.includes("La porte s'est fermée"))).toBe(true);
  });

  it("la porte ne claque pas sous les yeux du joueur, ni avec lui dedans", () => {
    const s = setup();
    run(s, 0, 72, { coldDoorSeen: true });
    expect(s.narrative.locked).toBe(false);
    run(s, 72, 74, { zoneId: "froide", player: { x: 11, z: 54 } });
    expect(s.narrative.locked).toBe(false);
    run(s, 74, 75);
    expect(s.narrative.locked).toBe(true);
  });

  it("Sabine se refroidit, puis se tait", () => {
    const s = setup();
    run(s, 0, 72);
    const t = s.narrative.temperature;
    run(s, 72, 200);
    expect(s.narrative.temperature).toBeLessThan(t);
    expect(s.narrative.temperature).toBeGreaterThan(40);
    run(s, 200, 360);
    expect(s.narrative.silent).toBe(true);
  });

  it("l'appel au talkie donne un indice selon la situation", () => {
    const s = setup();
    run(s, 0, 72);
    s.talkie.clear();
    s.lines.length = 0;
    s.narrative.call(ctx(80, { hasPhoto: false }));
    run(s, 80, 81);
    expect(s.lines.join(" ")).toMatch(/plan/i);
  });

  it("porte ouverte : elle ne se refroidit plus, ne se fait pas re-enfermer, et Farid peut la porter", () => {
    const s = setup();
    run(s, 0, 72);
    expect(s.narrative.locked).toBe(true);
    s.doors.unbolt(s.doors.get("froide"));
    s.narrative.onColdRoomOpened();
    const t = s.narrative.temperature;
    run(s, 72, 120);
    expect(s.narrative.temperature).toBe(t);
    expect(s.narrative.locked).toBe(false);
    expect(s.doors.get("froide").bolted).toBe(false);
    expect(s.narrative.canPickUp).toBe(true);
    s.narrative.pickUp();
    run(s, 120, 180, { player: { x: 20, z: 30 } });
    expect(s.narrative.carried).toBe(true);
    expect(s.narrative.temperature).toBeGreaterThan(t);
    // Sa voix vient de l'épaule de Farid.
    expect(s.npcs.sabine.x).toBeCloseTo(20, 0);
    expect(s.npcs.sabine.figure.enabled).toBe(false);
  });

  it("morte de froid : silence radio, et derrière la porte il ne reste que sa lampe", () => {
    const s = setup();
    run(s, 0, 72);
    run(s, 72, 360);
    expect(s.narrative.silent).toBe(true);
    expect(s.npcs.sabine.figure.enabled).toBe(false);
    expect(s.npcs.lamp.isEnabled()).toBe(true);
    s.lines.length = 0;
    s.narrative.onColdRoomOpened();
    run(s, 300, 301);
    expect(s.lines.join(" ")).toMatch(/Personne/);
    expect(s.narrative.canPickUp).toBe(false);
  });

  it("au talkie, Sabine explique le code de la caisse quand Farid l'a trouvée fermée", () => {
    const s = setup();
    run(s, 0, 72);
    s.talkie.clear();
    s.lines.length = 0;
    s.narrative.call(ctx(160, { hasPhoto: true, registerExamined: true, player: { x: 18, z: 30 } }));
    run(s, 160, 162);
    expect(s.lines.join(" ")).toMatch(/vingt minutes|caméra du fond/);
  });
});
