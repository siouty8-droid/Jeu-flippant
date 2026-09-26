import { CONFIG } from "../config";

/**
 * Deux mesures du temps passé par le joueur (cf. DESIGN.md, point 1) :
 * - l'ancrage : temps cumulé dans chaque rayon, qui le stabilise (règle 1) ;
 * - la stagnation : temps passé quasi immobile au même endroit, qui fait bouger ce qui l'entoure.
 */
export class DwellTracker {
  private readonly moduleSeconds = new Map<number, number>();
  private anchorX = 0;
  private anchorZ = 0;
  private hasAnchor = false;
  /** Secondes de stagnation accumulées. */
  stagnation = 0;
  private triggered = false;
  /** Multiplicateur du seuil (plus bas quand Farid porte Sabine). */
  thresholdScale = 1;

  update(dt: number, x: number, z: number, moduleId: number | null, readingPlan: boolean, minutes: number): void {
    if (moduleId !== null) this.moduleSeconds.set(moduleId, (this.moduleSeconds.get(moduleId) ?? 0) + dt);

    const c = CONFIG.stagnation;
    const moved = !this.hasAnchor || Math.hypot(x - this.anchorX, z - this.anchorZ) > c.radius;
    if (moved) {
      this.anchorX = x;
      this.anchorZ = z;
      this.hasAnchor = true;
    }
    // Lire le plan sur son téléphone compte comme stagner, même en marchant.
    if (moved && !readingPlan) this.stagnation = 0;
    else this.stagnation += dt;

    if (minutes >= CONFIG.reshuffle.activeFromMinutes && this.stagnation >= DwellTracker.threshold(minutes) * this.thresholdScale) {
      this.triggered = true;
      this.stagnation = 0;
    }
  }

  reset(): void {
    this.moduleSeconds.clear();
    this.hasAnchor = false;
    this.stagnation = 0;
    this.triggered = false;
    this.thresholdScale = 1;
  }

  /** Seuil de stagnation (s) à une heure donnée : 8 s en début de nuit, 3 s vers 4h30. */
  static threshold(minutes: number): number {
    const c = CONFIG.stagnation;
    const t = Math.min(1, Math.max(0, (minutes - c.rampFromMinutes) / (c.rampToMinutes - c.rampFromMinutes)));
    return c.thresholdStart + (c.thresholdEnd - c.thresholdStart) * t;
  }

  /** 0 = rayon jamais fréquenté, 1 = rayon complètement ancré. */
  anchor(moduleId: number): number {
    return Math.min(1, (this.moduleSeconds.get(moduleId) ?? 0) / CONFIG.reshuffle.anchorFullSeconds);
  }

  secondsIn(moduleId: number): number {
    return this.moduleSeconds.get(moduleId) ?? 0;
  }

  /** Vrai une seule fois après chaque déclenchement de stagnation. */
  consumeTrigger(): boolean {
    const t = this.triggered;
    this.triggered = false;
    return t;
  }
}
