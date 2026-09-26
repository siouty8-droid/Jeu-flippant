import { describe, expect, it } from "vitest";
import { CONFIG } from "../src/config";
import { Rng } from "../src/core/Rng";
import { ShopperBrain, angleDiff, stopChance, type ShopperSenses } from "../src/systems/ShopperBrain";
import { NavGraph } from "../src/world/NavGraph";
import { OcclusionMap } from "../src/world/Occlusion";
import { HALLOWEEN_MODULE, StoreLayout, type Box3 } from "../src/world/StoreLayout";

const GONDOLAS: Box3[] = [-2.4, 2.4].map((x) => ({ minX: x - 0.6, maxX: x + 0.6, minY: 0, maxY: 2.15, minZ: -4, maxZ: 4 }));

function setup(seed = 1) {
  const layout = new StoreLayout();
  const occ = new OcclusionMap(layout);
  layout.assignment.forEach((id, s) => occ.setModule(id, GONDOLAS, layout.slots[s]));
  const graph = new NavGraph(layout);
  const brain = new ShopperBrain(graph, new Rng(seed));
  const senses = (player: { x: number; z: number }, minutes: number, noiseRadius = 0): ShopperSenses => ({
    minutes,
    player,
    noiseRadius,
    lineOfSight: !occ.blocked({ x: player.x, y: 1.68, z: player.z }, { x: brain.x, y: 1.6, z: brain.z }),
    isClear: (ax, az, bx, bz) => !occ.blocked({ x: ax, y: 0.3, z: az }, { x: bx, y: 0.3, z: bz }),
  });
  return { layout, occ, graph, brain, senses };
}

describe("NavGraph", () => {
  it("tous les nœuds sont reliés entre eux", () => {
    const { graph } = setup();
    for (const n of graph.nodes) if (graph.walkable(n.id)) expect(graph.path(0, n.id).length).toBeGreaterThan(0);
  });

  it("les arêtes ne traversent ni gondole ni mur", () => {
    const { graph, occ } = setup();
    for (const n of graph.nodes) {
      for (const m of graph.neighbors(n.id)) {
        expect(occ.blocked({ x: n.x, y: 0.3, z: n.z }, { x: graph.nodes[m].x, y: 0.3, z: graph.nodes[m].z })).toBe(false);
      }
    }
  });

  it("les chemins évitent l'allée encombrée du présentoir Halloween", () => {
    const { graph, layout } = setup();
    const halloweenSlot = layout.slotOfModule(HALLOWEEN_MODULE);
    const mid = graph.nodes.find((n) => n.slot === halloweenSlot)!;
    const a = graph.nearest(mid.x, mid.z - 6);
    const b = graph.nearest(mid.x, mid.z + 6);
    expect(graph.path(a.id, b.id)).not.toContain(mid.id);
  });
});

describe("ShopperBrain", () => {
  it("la probabilité d'arrêt monte au fil de la nuit", () => {
    expect(stopChance(100)).toBe(0);
    expect(stopChance(150)).toBeCloseTo(0.35);
    expect(stopChance(240)).toBeCloseTo(0.7);
    expect(stopChance(330)).toBeCloseTo(0.9);
  });

  it("avant 02:30 il ne s'arrête jamais", () => {
    const { brain, senses } = setup();
    brain.activate({ x: 18, z: 4 });
    const player = { x: 18, z: 10.5 };
    for (let t = 0; t < 240; t += 0.1) {
      brain.update(0.1, senses(player, 100));
      expect(brain.state).toBe("shopping");
      expect(brain.speed).toBeGreaterThan(0);
    }
  });

  it("arrêté, il n'entend pas un joueur qui marche à distance, mais entend la course", () => {
    const { brain, senses } = setup();
    brain.activate({ x: 18, z: 4 });
    brain.forceStop(30);
    const player = { x: brain.x, z: brain.z - 6 };
    for (let t = 0; t < 2; t += 0.1) brain.update(0.1, senses(player, 200, CONFIG.noise.walkRadius));
    expect(brain.state).toBe("stopped");
    brain.update(0.1, senses(player, 200, CONFIG.noise.runRadius));
    expect(brain.state).toBe("hunting");
  });

  it("en traque, il rattrape un joueur immobile", () => {
    const { brain, senses } = setup(4);
    brain.activate({ x: 18, z: 4 });
    const player = { x: 12.5, z: 22.5 };
    brain.forceStop(30);
    brain.update(0.1, senses(player, 200, 100));
    expect(brain.state).toBe("hunting");
    for (let t = 0; t < 60 && brain.state === "hunting"; t += 0.05) brain.update(0.05, senses(player, 200, t < 1 ? 100 : 0));
    expect(brain.state).toBe("caught");
  });

  it("il abandonne si on s'éloigne sans bruit", () => {
    const { brain, senses } = setup(5);
    brain.activate({ x: 18, z: 4 });
    brain.forceStop(30);
    brain.update(0.1, senses({ x: 2, z: 10.5 }, 200, 100));
    expect(brain.state).toBe("hunting");
    // Le joueur est loin, derrière des murs (arrière-boutique), et ne fait plus de bruit.
    for (let t = 0; t < 40; t += 0.1) brain.update(0.1, senses({ x: 3.5, z: 57 }, 200, 0));
    expect(brain.state).toBe("shopping");
  });

  it("on ne voit jamais son visage", () => {
    // Simulation longue : le joueur tourne dans le magasin ; à chaque frame où il a une ligne de vue
    // sur le client, l'angle entre le regard du client et le joueur doit rester au-delà de 90°.
    for (let seed = 1; seed <= 6; seed++) {
      const { brain, senses, graph } = setup(seed);
      brain.activate({ x: 18, z: 4 });
      const loop = graph.nodes.filter((n) => n.slot === undefined);
      let target = 0;
      const player = { x: 18, z: 10.5 };
      for (let t = 0; t < 300; t += 0.05) {
        const goal = loop[target % loop.length];
        const dx = goal.x - player.x;
        const dz = goal.z - player.z;
        const len = Math.hypot(dx, dz);
        if (len < 0.2) target += 7;
        else {
          player.x += (dx / len) * Math.min(len, 1.5 * 0.05);
          player.z += (dz / len) * Math.min(len, 1.5 * 0.05);
        }
        const s = senses(player, 200, 0);
        brain.update(0.05, s);
        if (brain.state === "caught") break;
        if (s.lineOfSight) {
          const toPlayer = Math.atan2(player.x - brain.x, player.z - brain.z);
          expect(Math.abs(angleDiff(brain.bodyYaw, toPlayer))).toBeGreaterThan(Math.PI / 2);
        }
      }
    }
  });
});
