import type { AudioEngine } from "./AudioEngine";
import { breath } from "./Sounds";

/**
 * Le souffle de Farid : il s'essouffle en courant et en portant Sabine, et retient sa
 * respiration quand le client s'est arrêté tout près (le silence, c'est la tension).
 * Portée sur son dos, Sabine respire faiblement contre son oreille.
 */
export class Breath {
  private exertion = 0;
  private timer = 0;
  private inhale = true;
  private sabineTimer = 3;

  constructor(private readonly audio: AudioEngine) {}

  reset(): void {
    this.exertion = 0;
    this.timer = 0;
  }

  update(dt: number, s: { running: boolean; moving: boolean; carrying: boolean; holding: boolean; sabineWeakness: number }): void {
    const target = s.running ? 1 : s.carrying && s.moving ? 0.6 : s.carrying ? 0.35 : 0;
    this.exertion += (target - this.exertion) * Math.min(1, dt * (target > this.exertion ? 0.35 : 0.12));

    if (s.carrying && !s.holding) {
      this.sabineTimer -= dt;
      if (this.sabineTimer <= 0) {
        this.sabineTimer = 2.8 + Math.random() * 2.5;
        breath(this.audio, "body", false, 0.35 + 0.4 * (1 - s.sabineWeakness), 1.7);
      }
    }
    if (s.holding || this.exertion < 0.12) {
      this.timer = Math.min(this.timer, 0.3);
      return;
    }
    this.timer -= dt;
    if (this.timer > 0) return;
    breath(this.audio, "body", this.inhale, this.exertion);
    // Plus il est essoufflé, plus ça va vite : ~1,5 s par demi-souffle au repos, 0,4 s à bout.
    this.timer = (1.5 - this.exertion * 1.1) * (this.inhale ? 0.8 : 1.1);
    this.inhale = !this.inhale;
  }
}
