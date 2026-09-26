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

/** Porte qui s'ouvre : grincement de gond + loquet. `heavy` pour les portes métalliques. */
export function doorOpen(audio: AudioEngine, pos: Vec3Like, heavy: boolean): void {
  audio.burst(pos, { freq: 2600, q: 3, gain: 0.25, duration: 0.05 });
  audio.tone(pos, { freq: heavy ? 180 : 320, freqEnd: heavy ? 140 : 520, gain: 0.05, duration: 0.5, type: "sawtooth" });
}

/** Porte qui se ferme : choc sourd + loquet. */
export function doorClose(audio: AudioEngine, pos: Vec3Like, heavy: boolean, gain = 1): void {
  audio.tone(pos, { freq: heavy ? 70 : 110, freqEnd: 40, gain: 0.5 * gain, duration: heavy ? 0.35 : 0.2 });
  audio.burst(pos, { freq: heavy ? 400 : 900, q: 0.8, gain: 0.45 * gain, duration: heavy ? 0.25 : 0.12, type: "lowpass" });
  audio.burst(pos, { freq: 3000, q: 4, gain: 0.2 * gain, duration: 0.04 });
}

/** Poignée qui ne tourne pas : porte fermée à clé. */
export function doorLocked(audio: AudioEngine, pos: Vec3Like): void {
  for (let i = 0; i < 3; i++) setTimeout(() => audio.burst(pos, { freq: 1800, q: 2.5, gain: 0.25, duration: 0.05 }), i * 90);
}

/** Trousseau qui tinte, clé qui tourne. */
export function keyTurn(audio: AudioEngine, pos: Vec3Like): void {
  for (let i = 0; i < 4; i++) setTimeout(() => audio.tone(pos, { freq: 3200 + Math.random() * 1400, gain: 0.05, duration: 0.12, type: "triangle" }), i * 45);
  setTimeout(() => audio.burst(pos, { freq: 1500, q: 3, gain: 0.35, duration: 0.07 }), 260);
}

/** Verrou qu'on tire (chambre froide). */
export function boltSlide(audio: AudioEngine, pos: Vec3Like): void {
  audio.burst(pos, { freq: 2200, q: 1.5, gain: 0.3, duration: 0.25 });
  setTimeout(() => audio.burst(pos, { freq: 900, q: 2, gain: 0.5, duration: 0.08 }), 240);
}

/** Coups frappés de l'autre côté d'une porte. */
export function knock(audio: AudioEngine, pos: Vec3Like, count = 3): void {
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      audio.tone(pos, { freq: 95, freqEnd: 60, gain: 0.45, duration: 0.14 });
      audio.burst(pos, { freq: 700, q: 1, gain: 0.3, duration: 0.08, type: "lowpass" });
    }, i * 260 + Math.random() * 60);
  }
}

/** Grésillement de talkie (début ou fin de transmission). */
export function squelch(audio: AudioEngine): void {
  audio.burst(null, { freq: 2600, q: 0.6, gain: 0.18, duration: 0.18 });
  audio.tone(null, { freq: 1400, gain: 0.03, duration: 0.06, type: "square" });
}

/**
 * Voix synthétique : une suite de syllabes (source vocale + formant), assez pour donner
 * le rythme et le timbre d'une phrase sans fichier son. `radio` passe par un filtre talkie.
 * `weakness` (0..1) : plus c'est haut, plus la voix faiblit, se coupe et s'étouffe.
 */
export function speak(
  audio: AudioEngine,
  opts: { text: string; pitch: number; pos: Vec3Like | null; radio: boolean; weakness?: number; gain?: number },
): number {
  if (!audio.ready) return 0;
  const ctx = audio.ctx!;
  const weak = opts.weakness ?? 0;
  const out = ctx.createGain();
  out.gain.value = (opts.gain ?? 1) * (1 - weak * 0.7);
  let node: AudioNode = out;
  if (opts.radio) {
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 350;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 3200 - weak * 2200;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * 2 - 1;
      curve[i] = Math.tanh(x * 3);
    }
    shaper.curve = curve;
    out.connect(hp).connect(lp).connect(shaper);
    node = shaper;
    // Souffle radio sous la voix.
    const hiss = audio.noiseSource();
    const hissFilter = ctx.createBiquadFilter();
    hissFilter.type = "bandpass";
    hissFilter.frequency.value = 2500;
    const hissGain = ctx.createGain();
    hissGain.gain.value = 0.02 + weak * 0.04;
    hiss.connect(hissFilter).connect(hissGain).connect(audio.master!);
    const syllables = Math.max(3, Math.round(opts.text.length / 3.2));
    hiss.start();
    hiss.stop(ctx.currentTime + syllables * 0.13 + 0.3);
  }
  node.connect(audio.panner(opts.pos, 1.5, 1.0));

  const t0 = ctx.currentTime + 0.05;
  const syllables = Math.max(3, Math.round(opts.text.length / 3.2));
  let t = t0;
  for (let i = 0; i < syllables; i++) {
    const len = 0.08 + Math.random() * 0.07;
    // Les mots se perdent quand elle a froid.
    if (Math.random() > weak * 0.55) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      const f = opts.pitch * (0.9 + Math.random() * 0.25) * (i === syllables - 1 ? 0.85 : 1);
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.linearRampToValueAtTime(f * (0.92 + Math.random() * 0.1), t + len);
      const formant = ctx.createBiquadFilter();
      formant.type = "bandpass";
      formant.frequency.value = 700 + Math.random() * 1100;
      formant.Q.value = 3;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.22, t + 0.015);
      env.gain.linearRampToValueAtTime(0.0, t + len);
      osc.connect(formant).connect(env).connect(out);
      osc.start(t);
      osc.stop(t + len + 0.02);
    }
    t += len + (Math.random() < 0.18 ? 0.12 : 0.03) + weak * 0.08;
  }
  return t - t0;
}

/** Pas qui tournent en rond dans le local technique, toujours au même rythme. */
export function heavyStep(audio: AudioEngine, pos: Vec3Like): void {
  audio.tone(pos, { freq: 70, freqEnd: 45, gain: 0.3, duration: 0.12 });
  audio.burst(pos, { freq: 500, q: 1, gain: 0.2, duration: 0.07, type: "lowpass" });
}
