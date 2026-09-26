/**
 * Petit moteur audio Web Audio, sans fichier son : tout est synthétisé.
 *
 * Repère : Babylon est main gauche (z vers l'avant), Web Audio main droite (z vers l'arrière).
 * On inverse donc z pour toutes les positions et directions.
 */
export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/**
 * Où joue un son : une position dans le magasin (spatialisé), `"body"` (le corps de Farid :
 * ses pas, son souffle — pas de spatialisation, un peu de réverbération) ou `null` (dans la tête :
 * talkie, interface).
 */
export type SoundPos = Vec3Like | "body" | null;

export class AudioEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  /** Réverbération du magasin : grand volume carrelé, un peu plus d'une seconde et demie de queue. */
  private reverbIn: GainNode | null = null;
  /** Envoi constant vers la réverbération (avant la spatialisation) : un son lointain arrive surtout par l'écho. */
  private farSend: GainNode | null = null;
  private body: GainNode | null = null;
  private volume = 0.9;
  private muted = false;

  /** À appeler depuis un geste utilisateur (clic, touche) : les navigateurs bloquent l'audio sinon. */
  start(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
    } catch {
      return;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    const convolver = this.ctx.createConvolver();
    convolver.buffer = AudioEngine.impulse(this.ctx, 1.7);
    const wet = this.ctx.createGain();
    wet.gain.value = 0.55;
    this.reverbIn = this.ctx.createGain();
    this.reverbIn.gain.value = 0.3;
    this.reverbIn.connect(convolver).connect(wet).connect(this.master);
    this.farSend = this.ctx.createGain();
    this.farSend.gain.value = 0.06;
    this.farSend.connect(convolver);
    this.body = this.ctx.createGain();
    this.body.connect(this.master);
    const bodyWet = this.ctx.createGain();
    bodyWet.gain.value = 0.35;
    this.body.connect(bodyWet).connect(this.reverbIn);
  }

  /**
   * Réponse impulsionnelle synthétique : bruit stéréo qui décroît exponentiellement, de plus en
   * plus sourd (les aigus meurent plus vite), après un court pré-délai.
   */
  static impulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const pre = Math.floor(rate * 0.022);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let low = 0;
      for (let i = pre; i < len; i++) {
        const t = (i - pre) / rate;
        const white = Math.random() * 2 - 1;
        // Filtre passe-bas à un pôle dont la coupure descend avec le temps.
        const k = Math.max(0.04, 0.9 * Math.exp(-t * 2.2));
        low += k * (white - low);
        d[i] = low * Math.exp(-t * 3.4) * (1 + (ch === 0 ? 0.03 : -0.03));
      }
    }
    return buf;
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === "running";
  }

  get now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /** Coupe ou rétablit tout le son (fondu). */
  setMuted(muted: boolean, seconds = 0.4): void {
    this.muted = muted;
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(muted ? 0 : this.volume, this.ctx.currentTime, seconds / 3);
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.ctx && this.master && !this.muted) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  setListener(pos: Vec3Like, forward: Vec3Like): void {
    const l = this.ctx?.listener;
    if (!l) return;
    if (l.positionX) {
      const t = this.ctx!.currentTime;
      l.positionX.setTargetAtTime(pos.x, t, 0.02);
      l.positionY.setTargetAtTime(pos.y, t, 0.02);
      l.positionZ.setTargetAtTime(-pos.z, t, 0.02);
      l.forwardX.setTargetAtTime(forward.x, t, 0.02);
      l.forwardY.setTargetAtTime(forward.y, t, 0.02);
      l.forwardZ.setTargetAtTime(-forward.z, t, 0.02);
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else {
      l.setPosition(pos.x, pos.y, -pos.z);
      l.setOrientation(forward.x, forward.y, -forward.z, 0, 1, 0);
    }
  }

  /**
   * Point d'entrée d'un son selon sa position : spatialisé (HRTF + réverbération), sur le corps
   * de Farid, ou dans la tête.
   */
  panner(pos: SoundPos, refDistance = 2, rolloff = 1.3): AudioNode {
    if (pos === null) return this.master!;
    if (pos === "body") return this.body!;
    return this.spatial(pos, refDistance, rolloff).input;
  }

  /** Source spatialisée : `panner` peut être déplacé ensuite (roulettes, frigos…). */
  spatial(pos: Vec3Like, refDistance = 2, rolloff = 1.3): { input: AudioNode; panner: PannerNode } {
    const ctx = this.ctx!;
    const input = ctx.createGain();
    const p = ctx.createPanner();
    p.panningModel = "HRTF";
    p.distanceModel = "inverse";
    p.refDistance = refDistance;
    p.rolloffFactor = rolloff;
    p.maxDistance = 80;
    AudioEngine.place(p, pos);
    input.connect(p);
    p.connect(this.master!);
    p.connect(this.reverbIn!);
    input.connect(this.farSend!);
    return { input, panner: p };
  }

  /** Déplace une source en douceur (pas de clic quand elle saute d'un point à l'autre). */
  move(p: PannerNode, pos: Vec3Like, seconds = 0.08): void {
    if (!this.ctx || !p.positionX) {
      AudioEngine.place(p, pos);
      return;
    }
    const t = this.ctx.currentTime;
    p.positionX.setTargetAtTime(pos.x, t, seconds);
    p.positionY.setTargetAtTime(pos.y, t, seconds);
    p.positionZ.setTargetAtTime(-pos.z, t, seconds);
  }

  static place(p: PannerNode, pos: Vec3Like): void {
    if (p.positionX) {
      p.positionX.value = pos.x;
      p.positionY.value = pos.y;
      p.positionZ.value = -pos.z;
    } else p.setPosition(pos.x, pos.y, -pos.z);
  }

  noiseSource(loop = true): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.loop = loop;
    if (loop) src.loopStart = Math.random();
    return src;
  }

  /** Rafale de bruit filtré avec enveloppe : pas, grésillements, clics. */
  burst(pos: SoundPos, opts: { freq: number; q: number; gain: number; duration: number; type?: BiquadFilterType }): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = this.noiseSource(false);
    const filter = ctx.createBiquadFilter();
    filter.type = opts.type ?? "bandpass";
    filter.frequency.value = opts.freq;
    filter.Q.value = opts.q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(opts.gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.duration);
    src.connect(filter).connect(g).connect(this.panner(pos));
    src.start(t, Math.random() * 1.5, opts.duration + 0.05);
  }

  /** Note brève (tintement de conserve, grincement). */
  tone(pos: SoundPos, opts: { freq: number; freqEnd?: number; gain: number; duration: number; type?: OscillatorType }): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = opts.type ?? "sine";
    osc.frequency.setValueAtTime(opts.freq, t);
    if (opts.freqEnd) osc.frequency.exponentialRampToValueAtTime(opts.freqEnd, t + opts.duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(opts.gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.duration);
    osc.connect(g).connect(this.panner(pos));
    osc.start(t);
    osc.stop(t + opts.duration + 0.05);
  }
}
