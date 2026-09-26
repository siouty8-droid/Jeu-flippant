import { CONFIG } from "../config";
import type { EventBus } from "./EventBus";

/** Heure in-game, en minutes depuis minuit (0 → 360). */
export class GameClock {
  private minutes: number = CONFIG.clock.startMinutes;
  private lastWholeMinute = -1;
  private dawnEmitted = false;

  constructor(private readonly bus: EventBus) {}

  get totalMinutes(): number {
    return this.minutes;
  }

  update(dtSeconds: number): void {
    if (this.minutes >= CONFIG.clock.endMinutes) return;
    this.minutes += (dtSeconds * 60) / CONFIG.clock.realSecondsPerGameHour;
    this.syncEvents();
  }

  /** Saut dans le temps (debug). */
  set(minutes: number): void {
    this.minutes = Math.max(0, Math.min(CONFIG.clock.endMinutes, minutes));
    this.dawnEmitted = this.minutes >= CONFIG.clock.endMinutes ? this.dawnEmitted : false;
    this.syncEvents();
  }

  format(): string {
    return GameClock.format(this.minutes);
  }

  static format(minutes: number): string {
    const m = Math.floor(minutes);
    const h = Math.floor(m / 60) % 24;
    return `${String(h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  }

  private syncEvents(): void {
    const whole = Math.floor(this.minutes);
    if (whole !== this.lastWholeMinute) {
      this.lastWholeMinute = whole;
      this.bus.emit("clock:minute", { minutes: whole });
    }
    if (!this.dawnEmitted && this.minutes >= CONFIG.clock.endMinutes) {
      this.dawnEmitted = true;
      this.bus.emit("clock:dawn", {});
    }
  }
}
