import type { AudioEngine, Vec3Like } from "./AudioEngine";

/** Chambre froide : son compresseur, qu'on entend à travers les murs de la réserve. */
const COLD_ROOM = { x: 10.5, y: 3.2, z: 54 };

interface Hum {
  panner: PannerNode;
  gain: GainNode;
  level: number;
}

/**
 * Le fond sonore du magasin, spatialisé :
 * - une ventilation lointaine partout (grave, jamais silencieuse) ;
 * - le ballast du néon le plus proche, qui grésille au-dessus de toi ;
 * - les compresseurs des surgelés (ils suivent le rayon quand il bouge… on peut l'entendre),
 *   de la vitrine de la boucherie et de la chambre froide, qui s'arrêtent et repartent par cycles.
 */
export class Ambience {
  private readonly neon: Hum;
  private readonly fridges: Hum;
  private readonly butcher: Hum;
  private cycle = 25;
  private fridgeOn = true;

  constructor(private readonly audio: AudioEngine) {
    const ctx = audio.ctx!;

    // Ventilation : bruit brun, très grave.
    const hvac = audio.noiseSource();
    const hvacLow = ctx.createBiquadFilter();
    hvacLow.type = "lowpass";
    hvacLow.frequency.value = 95;
    const hvacGain = ctx.createGain();
    hvacGain.gain.value = 0.09;
    hvac.connect(hvacLow).connect(hvacGain).connect(audio.master!);
    hvac.start();

    // Ballast du néon : 100 Hz et ses harmoniques, un peu nasillard.
    this.neon = this.hum({ x: 18, y: 4, z: 3 }, 0.035, 1.2, 1.6, (input) => {
      for (const [f, type, g] of [[100, "sawtooth", 1], [200, "square", 0.25]] as const) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = f;
        const band = ctx.createBiquadFilter();
        band.type = "bandpass";
        band.frequency.value = 900;
        band.Q.value = 0.8;
        const og = ctx.createGain();
        og.gain.value = g;
        o.connect(band).connect(og).connect(input);
        o.start();
      }
    });
    const compressor = (input: AudioNode, cutoff: number, tone: number) => {
      const n = audio.noiseSource();
      const low = ctx.createBiquadFilter();
      low.type = "lowpass";
      low.frequency.value = cutoff;
      n.connect(low).connect(input);
      n.start();
      const o = ctx.createOscillator();
      o.frequency.value = tone;
      const og = ctx.createGain();
      og.gain.value = 0.35;
      o.connect(og).connect(input);
      o.start();
    };
    this.fridges = this.hum({ x: 0, y: 1, z: -50 }, 0.2, 2.5, 1.2, (input) => compressor(input, 170, 50));
    this.butcher = this.hum({ x: 0, y: 1, z: -50 }, 0.08, 1.5, 1.4, (input) => compressor(input, 240, 60));
    // La chambre froide ne bouge jamais : on la pose une fois pour toutes.
    this.hum(COLD_ROOM, 0.22, 3, 1.1, (input) => compressor(input, 130, 45));
  }

  private hum(pos: Vec3Like, level: number, ref: number, rolloff: number, build: (input: AudioNode) => void): Hum {
    const source = this.audio.spatial(pos, ref, rolloff);
    const gain = this.audio.ctx!.createGain();
    gain.gain.value = level;
    gain.connect(source.input);
    build(gain);
    return { panner: source.panner, gain, level };
  }

  /**
   * @param neon le néon le plus proche du joueur
   * @param fridges centre du rayon des surgelés (null s'il n'est pas dans le magasin)
   * @param butcher vitrine de la boucherie (null si absente)
   */
  update(dt: number, neon: Vec3Like, fridges: Vec3Like | null, butcher: Vec3Like | null): void {
    const t = this.audio.now;
    this.audio.move(this.neon.panner, neon, 0.25);
    if (fridges) this.audio.move(this.fridges.panner, fridges, 0.02);
    if (butcher) this.audio.move(this.butcher.panner, butcher, 0.02);
    // Les compresseurs s'arrêtent et repartent (avec un petit « clonk »).
    this.cycle -= dt;
    if (this.cycle <= 0) {
      this.fridgeOn = !this.fridgeOn;
      this.cycle = this.fridgeOn ? 30 + Math.random() * 40 : 8 + Math.random() * 12;
      const where = fridges ?? { x: 0, y: 1, z: -50 };
      this.audio.burst(where, { freq: 180, q: 1, gain: 0.3, duration: 0.12, type: "lowpass" });
    }
    this.fridges.gain.gain.setTargetAtTime(fridges && this.fridgeOn ? this.fridges.level : 0, t, fridges ? 0.6 : 0.01);
    this.butcher.gain.gain.setTargetAtTime(butcher ? this.butcher.level : 0, t, 0.3);
  }
}
