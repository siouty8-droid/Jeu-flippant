import { AudioEngine, type Vec3Like } from "./AudioEngine";

/** Pas sur le carrelage. `loud` = course. */
export function footstep(audio: AudioEngine, pos: Vec3Like | null, loud: boolean): void {
  audio.burst(pos, { freq: loud ? 2200 : 1800, q: 1.2, gain: loud ? 0.5 : 0.16, duration: loud ? 0.09 : 0.06 });
  audio.tone(pos, { freq: loud ? 95 : 80, freqEnd: 50, gain: loud ? 0.35 : 0.1, duration: 0.07 });
}

/** Grésillement d'un néon qui clignote. */
export function neonCrackle(audio: AudioEngine, pos: Vec3Like): void {
  audio.burst(pos, { freq: 3500 + Math.random() * 2500, q: 0.8, gain: 0.25, duration: 0.03 + Math.random() * 0.05 });
  audio.tone(pos, { freq: 100, gain: 0.05, duration: 0.12, type: "sawtooth" });
}

/** Une boîte de conserve posée dans un caddie. */
export function canClink(audio: AudioEngine, pos: Vec3Like): void {
  audio.tone(pos, { freq: 1650 + Math.random() * 300, gain: 0.12, duration: 0.25, type: "triangle" });
  audio.tone(pos, { freq: 2750 + Math.random() * 400, gain: 0.06, duration: 0.18 });
  audio.burst(pos, { freq: 3000, q: 2, gain: 0.12, duration: 0.04 });
}

/**
 * Roulettes de caddie en continu : grondement grave + cliquetis métallique irrégulier,
 * plus un grincement de temps en temps. Le volume suit la vitesse.
 */
export class CartRattle {
  private readonly panner: PannerNode;
  private readonly rumbleGain: GainNode;
  private readonly rattleGain: GainNode;
  private rattleTimer = 0;
  private squeakTimer = 3;
  private speed = 0;

  constructor(private readonly audio: AudioEngine) {
    const ctx = audio.ctx!;
    this.panner = audio.panner({ x: 0, y: 0.2, z: 0 }, 2.5, 1.1) as PannerNode;

    const rumble = audio.noiseSource();
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 220;
    this.rumbleGain = ctx.createGain();
    this.rumbleGain.gain.value = 0;
    rumble.connect(low).connect(this.rumbleGain).connect(this.panner);
    rumble.start();

    const rattle = audio.noiseSource();
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 1400;
    band.Q.value = 1.5;
    this.rattleGain = ctx.createGain();
    this.rattleGain.gain.value = 0;
    rattle.connect(band).connect(this.rattleGain).connect(this.panner);
    rattle.start();
  }

  update(dt: number, pos: Vec3Like, speed: number): void {
    AudioEngine.place(this.panner, pos);
    this.speed += (speed - this.speed) * Math.min(1, dt * 6);
    const t = this.audio.now;
    const level = Math.min(1, this.speed / 1.2);
    this.rumbleGain.gain.setTargetAtTime(level * 0.9, t, 0.05);
    this.rattleTimer -= dt;
    if (this.rattleTimer <= 0) {
      // Cliquetis : le gain saute au hasard, plus vite quand ça roule vite.
      this.rattleTimer = 0.03 + Math.random() * (0.09 / Math.max(0.3, this.speed));
      this.rattleGain.gain.setTargetAtTime(level * (0.15 + Math.random() * 0.5), t, 0.01);
    }
    if (this.speed > 0.3) {
      this.squeakTimer -= dt;
      if (this.squeakTimer <= 0) {
        this.squeakTimer = 4 + Math.random() * 7;
        this.audio.tone(pos, { freq: 2300 + Math.random() * 500, freqEnd: 2700, gain: 0.05 * level, duration: 0.35 });
      }
    }
  }
}

/** Bourdonnement de fond du magasin : frigos et ballasts de néons. */
export function startAmbience(audio: AudioEngine): void {
  const ctx = audio.ctx!;
  const hum = ctx.createOscillator();
  hum.type = "sawtooth";
  hum.frequency.value = 100;
  const humFilter = ctx.createBiquadFilter();
  humFilter.type = "lowpass";
  humFilter.frequency.value = 320;
  const humGain = ctx.createGain();
  humGain.gain.value = 0.018;
  hum.connect(humFilter).connect(humGain).connect(audio.master!);
  hum.start();

  const fridge = audio.noiseSource();
  const fFilter = ctx.createBiquadFilter();
  fFilter.type = "lowpass";
  fFilter.frequency.value = 140;
  const fGain = ctx.createGain();
  fGain.gain.value = 0.06;
  fridge.connect(fFilter).connect(fGain).connect(audio.master!);
  fridge.start();
}
