import { NullEngine, Scene, StandardMaterial, Vector3 } from "@babylonjs/core";
import { describe, expect, it } from "vitest";
import { AudioEngine } from "../src/audio/AudioEngine";
import { Inventory } from "../src/player/Inventory";
import { DoorSystem } from "../src/world/Doors";
import type { Materials } from "../src/world/Materials";
import { OcclusionMap } from "../src/world/Occlusion";
import { StoreLayout } from "../src/world/StoreLayout";

function setup() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const layout = new StoreLayout();
  const occ = new OcclusionMap(layout);
  // Pas de canvas en Node : des matériaux unis suffisent.
  const mats = new Proxy({}, { get: (_, key) => new StandardMaterial(String(key), scene) }) as Materials;
  const doors = new DoorSystem(scene, mats, layout, occ, new AudioEngine());
  return { doors, occ, inv: new Inventory() };
}

/** Fait tourner les portes, le joueur à `eye` regardant `forward`. */
function run(doors: DoorSystem, seconds: number, eye: Vector3, forward: Vector3) {
  let crossed = null;
  for (let t = 0; t < seconds; t += 0.05) crossed = doors.update(0.05, eye, forward, 0.9, { x: eye.x, z: eye.z }) ?? crossed;
  return crossed;
}

describe("DoorSystem", () => {
  it("le local technique s'ouvre avec la clé du trousseau, pas sans", () => {
    const { doors, inv } = setup();
    const door = doors.get("technique");
    expect(door.locked).toBe(true);
    const empty = new Inventory();
    (empty as unknown as { items: Set<string> }).items.clear();
    expect(doors.interact(door, empty, { x: 3.6, z: 47 }).ok).toBe(false);
    expect(doors.interact(door, inv, { x: 3.6, z: 47 }).ok).toBe(true);
    expect(door.isOpen).toBe(true);
  });

  it("refuse d'ouvrir une porte qui s'ouvre sur le joueur", () => {
    const { doors, inv } = setup();
    // Le poste de sécurité s'ouvre vers l'intérieur (-x) : on se met dedans, contre la porte.
    const door = doors.get("securite");
    doors.setOpen(door, false, { instant: true, silent: true });
    expect(doors.interact(door, inv, { x: 5.6, z: 3.95 }).ok).toBe(false);
    expect(doors.interact(door, inv, { x: 7.5, z: 3.95 }).ok).toBe(true);
  });

  it("une porte fermée bloque la vue, ouverte non", () => {
    const { doors, occ, inv } = setup();
    const door = doors.get("technique");
    const a = { x: 3.6, y: 1.5, z: 46 };
    const b = { x: 3.6, y: 1.5, z: 52 };
    expect(occ.blocked(a, b)).toBe(true);
    doors.interact(door, inv, { x: 3.6, z: 47 });
    run(doors, 1, new Vector3(3.6, 1.6, 46), new Vector3(0, 0, 1));
    expect(occ.blocked(a, b)).toBe(false);
  });

  it("règle 5 : une sortie de secours qu'on ne regarde plus se referme à clé", () => {
    const { doors, inv } = setup();
    const door = doors.get("secours-est");
    const eye = new Vector3(33, 1.6, 28.5);
    doors.interact(door, inv, { x: 33, z: 28.5 });
    expect(door.isOpen).toBe(true);
    // On la regarde : elle reste ouverte.
    run(doors, 8, eye, new Vector3(1, 0, 0));
    expect(door.isOpen).toBe(true);
    // On se retourne : elle se referme et se reverrouille.
    run(doors, 5, eye, new Vector3(-1, 0, 0));
    expect(door.isOpen).toBe(false);
    expect(door.locked).toBe(true);
  });

  it("franchir une sortie de secours ouverte est détecté", () => {
    const { doors, inv } = setup();
    const door = doors.get("secours-ouest");
    doors.interact(door, inv, { x: 1.5, z: 28.5 });
    expect(run(doors, 0.5, new Vector3(-0.8, 1.6, 28.5), new Vector3(-1, 0, 0))?.def.id).toBe("secours-ouest");
  });

  it("chambre froide : le verrou rend toutes les clés inutiles, jusqu'à la nuit suivante", () => {
    const { doors, inv } = setup();
    const door = doors.get("froide");
    doors.slamAndBolt(door);
    const r = doors.interact(door, inv, { x: 15.5, z: 53.65 });
    expect(r.ok).toBe(false);
    expect(door.isOpen).toBe(false);
    doors.reset();
    expect(door.bolted).toBe(false);
    expect(doors.interact(door, inv, { x: 16.5, z: 53.65 }).ok).toBe(true);
  });
});
