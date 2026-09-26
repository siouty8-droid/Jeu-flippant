import type { Scene } from "@babylonjs/core";
import { Figure } from "./Figure";

/** Calque visible uniquement par les caméras de surveillance. */
export const CCTV_ONLY_LAYER = 0x10000000;

/**
 * Farid tel que le voient les caméras : uniforme de vigile, casquette.
 * Invisible pour la caméra du joueur (calque dédié) : on ne se voit que dans le replay.
 */
export function buildFaridModel(scene: Scene, name = "farid-cctv"): Figure {
  const f = new Figure(scene, name, { top: "#2e3b52", bottom: "#1c2433", skin: "#8a6a55", hair: "#1a1512", hat: "#1c2433" }, CCTV_ONLY_LAYER);
  f.setEnabled(false);
  return f;
}
