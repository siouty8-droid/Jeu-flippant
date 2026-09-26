import { Mesh, MeshBuilder, Scene, TransformNode } from "@babylonjs/core";
import type { Materials } from "./Materials";

/** Caddie simplifié. Réutilisé par le client de la nuit (règle 4). */
export function buildCart(scene: Scene, mats: Materials, name: string): TransformNode {
  const root = new TransformNode(name, scene);
  const frame: Mesh[] = [];
  const bar = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const b = MeshBuilder.CreateBox("barre", { width: w, height: h, depth: d }, scene);
    b.position.set(x, y, z);
    frame.push(b);
  };
  // Panier : bords en fil métallique (on ne modélise que les arêtes).
  const W = 0.55;
  const L = 0.85;
  const y0 = 0.45;
  const y1 = 0.95;
  for (const y of [y0, y1, (y0 + y1) / 2]) {
    bar(W, 0.015, 0.015, 0, y, -L / 2);
    bar(W, 0.015, 0.015, 0, y, L / 2);
    bar(0.015, 0.015, L, -W / 2, y, 0);
    bar(0.015, 0.015, L, W / 2, y, 0);
  }
  for (const x of [-W / 2, W / 2]) for (const z of [-L / 2, L / 2]) bar(0.02, y1 - y0, 0.02, x, (y0 + y1) / 2, z);
  bar(W, 0.01, L, 0, y0, 0);
  // Châssis et poignée.
  for (const x of [-W / 2 + 0.05, W / 2 - 0.05]) {
    bar(0.03, 0.03, L, x, 0.12, 0);
    bar(0.03, y0 - 0.12, 0.03, x, (y0 + 0.12) / 2, -L / 2 + 0.05);
    bar(0.03, 0.2, 0.03, x, y1 + 0.08, -L / 2 - 0.05);
  }
  const body = Mesh.MergeMeshes(frame, true)!;
  body.name = `${name}-chassis`;
  body.material = mats.shelfMetal;
  body.parent = root;

  const handle = MeshBuilder.CreateCylinder(`${name}-poignee`, { diameter: 0.035, height: W }, scene);
  handle.rotation.z = Math.PI / 2;
  handle.position.set(0, y1 + 0.18, -L / 2 - 0.05);
  handle.material = mats.darkPlastic;
  handle.parent = root;

  const wheels: Mesh[] = [];
  for (const x of [-W / 2 + 0.05, W / 2 - 0.05]) {
    for (const z of [-L / 2 + 0.05, L / 2 - 0.05]) {
      const wheel = MeshBuilder.CreateCylinder("roue", { diameter: 0.1, height: 0.03 }, scene);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.05, z);
      wheels.push(wheel);
    }
  }
  const wheelMesh = Mesh.MergeMeshes(wheels, true)!;
  wheelMesh.material = mats.darkPlastic;
  wheelMesh.parent = root;

  return root;
}
