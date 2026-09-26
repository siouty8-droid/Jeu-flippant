import { MeshBuilder, Scene, TransformNode } from "@babylonjs/core";
import { mat } from "./Materials";

/** Calque visible uniquement par les caméras de surveillance. */
export const CCTV_ONLY_LAYER = 0x10000000;

/**
 * Farid tel que le voient les caméras : uniforme de vigile, casquette.
 * Invisible pour la caméra du joueur (calque dédié) : on ne se voit que dans le replay.
 */
export function buildFaridModel(scene: Scene): TransformNode {
  const root = new TransformNode("farid-cctv", scene);
  const uniform = mat(scene, "uniforme", "#1c2433");
  const shirt = mat(scene, "chemise", "#3b4d6b");
  const skin = mat(scene, "peau-farid", "#8a6a55");
  const parts = [
    (() => {
      const m = MeshBuilder.CreateCylinder("farid-jambes", { diameterTop: 0.36, diameterBottom: 0.3, height: 0.9, tessellation: 10 }, scene);
      m.position.y = 0.45;
      m.material = uniform;
      return m;
    })(),
    (() => {
      const m = MeshBuilder.CreateCylinder("farid-buste", { diameterTop: 0.46, diameterBottom: 0.38, height: 0.62, tessellation: 12 }, scene);
      m.position.y = 1.21;
      m.material = shirt;
      return m;
    })(),
    (() => {
      const m = MeshBuilder.CreateSphere("farid-tete", { diameterX: 0.2, diameterY: 0.24, diameterZ: 0.22, segments: 10 }, scene);
      m.position.y = 1.66;
      m.material = skin;
      return m;
    })(),
    (() => {
      const m = MeshBuilder.CreateCylinder("farid-casquette", { diameter: 0.23, height: 0.07, tessellation: 12 }, scene);
      m.position.set(0, 1.77, 0.02);
      m.material = uniform;
      return m;
    })(),
    (() => {
      const m = MeshBuilder.CreateBox("farid-visiere", { width: 0.18, height: 0.02, depth: 0.1 }, scene);
      m.position.set(0, 1.75, 0.15);
      m.material = uniform;
      return m;
    })(),
  ];
  for (const p of parts) {
    p.parent = root;
    p.layerMask = CCTV_ONLY_LAYER;
    p.isPickable = false;
  }
  root.setEnabled(false);
  return root;
}
