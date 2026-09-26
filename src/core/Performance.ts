import type { Engine } from "@babylonjs/core";

/**
 * Résolution adaptative : si le jeu reste sous ~48 fps, on baisse la résolution de rendu ;
 * s'il y a beaucoup de marge pendant longtemps, on remonte.
 *
 * Changer la résolution réalloue toutes les textures du post-traitement (un à-coup) :
 * on le fait donc rarement, par gros paliers, jamais plus d'une fois toutes les 6 s.
 */
export class AdaptiveResolution {
  private scale: number;
  private timer = 0;
  private lowFor = 0;
  private highFor = 0;
  private sinceChange = 0;

  constructor(
    private readonly engine: Engine,
    private minScale: number,
    private maxScale: number,
  ) {
    this.scale = minScale;
    engine.setHardwareScalingLevel(this.scale);
  }

  get level(): number {
    return this.scale;
  }

  setRange(minScale: number, maxScale: number): void {
    this.minScale = minScale;
    this.maxScale = maxScale;
    const next = Math.min(maxScale, Math.max(minScale, this.scale));
    if (next !== this.scale) this.apply(next);
  }

  update(dt: number): void {
    this.sinceChange += dt;
    this.timer += dt;
    if (this.timer < 0.5) return;
    const step = this.timer;
    this.timer = 0;
    const fps = this.engine.getFps();
    if (fps < 48) {
      this.lowFor += step;
      this.highFor = 0;
    } else if (fps > 58) {
      this.highFor += step;
      this.lowFor = 0;
    } else {
      this.lowFor = this.highFor = 0;
    }
    if (this.sinceChange < 6) return;
    if (this.lowFor >= 3 && this.scale < this.maxScale) this.apply(Math.min(this.maxScale, this.scale + 0.2));
    else if (this.highFor >= 12 && this.scale > this.minScale) this.apply(Math.max(this.minScale, this.scale - 0.1));
  }

  private apply(scale: number): void {
    this.scale = Math.round(scale * 100) / 100;
    this.engine.setHardwareScalingLevel(this.scale);
    this.sinceChange = 0;
    this.lowFor = this.highFor = 0;
  }
}
