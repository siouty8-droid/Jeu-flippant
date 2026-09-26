import { Color3, HemisphericLight, PointLight, Scene, Vector3 } from "@babylonjs/core";
import { CONFIG } from "../config";
import type { NeonFixture } from "./WorldBuilder";

/**
 * Éclairage : une hémisphérique faible pour ne jamais être dans le noir complet,
 * plus un petit pool de PointLight qui se collent aux néons les plus proches du joueur.
 *
 * Pour éviter les « pops » quand une lumière change de néon, l'intensité de chaque
 * lumière décroît avec la distance jusqu'au rayon du premier néon non retenu :
 * une lumière qui va être réassignée est déjà quasi éteinte.
 */
export class Lighting {
  private readonly pool: PointLight[] = [];
  private readonly anchors: { pos: Vector3; cold: boolean; fixture: number }[] = [];
  /** Réutilisé à chaque frame : pas d'allocation, pas d'à-coups du ramasse-miettes. */
  private scratch: { index: number; dist: number }[] = [];

  constructor(scene: Scene, neons: NeonFixture[]) {
    const hemi = new HemisphericLight("ambiance", new Vector3(0, 1, 0), scene);
    hemi.intensity = CONFIG.rendering.ambientIntensity;
    hemi.diffuse = new Color3(0.86, 0.9, 0.95);
    hemi.groundColor = new Color3(0.34, 0.34, 0.37);
    hemi.specular = new Color3(0.1, 0.1, 0.1);

    neons.forEach((n, fixture) => {
      for (const a of n.anchors) this.anchors.push({ pos: a, cold: n.cold, fixture });
    });
    this.scratch = this.anchors.map((_, index) => ({ index, dist: 0 }));

    for (let i = 0; i < CONFIG.rendering.lightPoolSize; i++) {
      const l = new PointLight(`neon-lumiere-${i}`, Vector3.Zero(), scene);
      l.range = CONFIG.rendering.lightRange;
      l.diffuse = new Color3(0.95, 0.97, 1.0);
      l.specular = new Color3(0.5, 0.5, 0.5);
      l.intensity = 0;
      this.pool.push(l);
    }
  }

  /** `neon(i)` donne la couleur et la luminosité actuelles du néon i (NeonSystem). */
  update(player: Vector3, neon?: (fixture: number) => { color: Color3; level: number }): void {
    const s = this.scratch;
    for (const e of s) {
      const a = this.anchors[e.index].pos;
      const dx = a.x - player.x;
      const dz = a.z - player.z;
      e.dist = Math.sqrt(dx * dx + dz * dz);
    }
    s.sort((a, b) => a.dist - b.dist);
    const n = this.pool.length;
    const cutoff = s[n]?.dist ?? CONFIG.rendering.lightRange;
    for (let i = 0; i < n; i++) {
      const light = this.pool[i];
      const pick = s[i];
      if (!pick) {
        light.intensity = 0;
        continue;
      }
      const anchor = this.anchors[pick.index];
      light.position.copyFrom(anchor.pos);
      const t = Math.min(1, Math.max(0, (cutoff - pick.dist) / Math.max(0.001, cutoff * 0.45)));
      const state = neon?.(anchor.fixture);
      light.intensity = CONFIG.rendering.lightIntensity * t * t * (3 - 2 * t) * (state?.level ?? 1);
      if (state) light.diffuse.copyFrom(state.color);
      else if (anchor.cold) light.diffuse.set(0.7, 0.85, 1.0);
      else light.diffuse.set(0.95, 0.97, 1.0);
    }
  }
}
