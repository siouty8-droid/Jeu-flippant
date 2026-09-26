import type { AudioEngine, Vec3Like } from "../audio/AudioEngine";
import { speak, squelch } from "../audio/Sounds";
import type { Rng } from "../core/Rng";
import type { Hud } from "../ui/Hud";
import { degrade, type Line } from "./Dialogues";

const LABELS: Record<Line["speaker"], string> = { sabine: "SABINE", farid: "FARID", pensee: "" };

/**
 * File des répliques : une à la fois, sous-titrée, avec la voix synthétique et le grésillement
 * du talkie. La voix de Sabine faiblit avec le froid (texte abîmé, volume, coupures).
 */
export class Talkie {
  private readonly queue: { line: Line; delay: number }[] = [];
  private remaining = 0;

  constructor(
    private readonly audio: AudioEngine,
    private readonly hud: Hud,
    private readonly rng: Rng,
    /** Faiblesse de Sabine, 0..1. */
    private readonly weakness: () => number,
    /** Position de Sabine pour sa voix « en vrai ». */
    private readonly sabinePos: () => Vec3Like,
  ) {}

  get busy(): boolean {
    return this.remaining > 0 || this.queue.length > 0;
  }

  /** Ajoute des répliques ; `interrupt` coupe ce qui est en cours (urgence). */
  say(lines: Line | Line[], opts: { interrupt?: boolean; delay?: number } = {}): void {
    if (opts.interrupt) {
      this.queue.length = 0;
      this.remaining = 0;
    }
    const list = Array.isArray(lines) ? lines : [lines];
    list.forEach((line, i) => this.queue.push({ line, delay: i === 0 ? (opts.delay ?? 0) : 0.35 }));
  }

  clear(): void {
    this.queue.length = 0;
    this.remaining = 0;
  }

  update(dt: number): void {
    if (this.remaining > 0) {
      this.remaining -= dt;
      return;
    }
    const next = this.queue[0];
    if (!next) return;
    next.delay -= dt;
    if (next.delay > 0) return;
    this.queue.shift();
    this.play(next.line);
  }

  private play(line: Line): void {
    const weak = line.speaker === "sabine" ? this.weakness() : 0;
    const text = line.speaker === "sabine" && line.via === "talkie" ? degrade(line.text, weak, this.rng) : line.text;
    const seconds = Math.max(2.4, text.length * 0.058 + 0.9);
    this.remaining = seconds;
    this.hud.showLine(line.via === "inner" ? null : `${LABELS[line.speaker]}${line.via === "talkie" ? " · talkie" : ""}`, text, line.via, seconds + 0.4);
    if (line.via === "inner") return;
    if (line.via === "talkie") {
      squelch(this.audio);
      setTimeout(() => squelch(this.audio), seconds * 1000 - 200);
    }
    const whisper = text.startsWith("(chuchote)");
    speak(this.audio, {
      text,
      pitch: line.speaker === "sabine" ? 215 : 118,
      pos: line.via === "direct" ? this.sabinePos() : null,
      radio: line.via === "talkie" && line.speaker === "sabine",
      weakness: weak,
      gain: line.speaker === "farid" ? 0.35 : whisper ? 0.45 : 0.9,
    });
  }
}
