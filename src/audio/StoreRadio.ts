import { CONFIG } from "../config";
import type { RadioChoice } from "../systems/RadioDirector";
import type { AudioEngine } from "./AudioEngine";
import { composeTrack, midiToHz, type NoteEvent, type Track } from "./Muzak";

interface Deck {
  track: Track;
  gain: GainNode;
  /** Secondes par temps. */
  spb: number;
  loopIndex: number;
  noteIndex: number;
  /** Moment où le deck a commencé à s'éteindre (null : il joue). */
  fadingSince: number | null;
}

/**
 * La radio du magasin : de la muzak synthétisée en Web Audio, jouée par les haut-parleurs du plafond.
 *
 * Tous les morceaux tournent « en continu » sur une horloge commune (comme une vraie radio) :
 * quand on revient dans une zone, le morceau a avancé. Changer de zone fait un fondu enchaîné
 * entre deux decks. Les notes sont programmées un peu en avance (400 ms) à chaque frame.
 */
export class StoreRadio {
  private bus: GainNode | null = null;
  private lowpass: BiquadFilterNode | null = null;
  private readonly decks = new Map<string, Deck>();
  private readonly tracks = new Map<string, Track>();
  private epoch = 0;
  current: string | null = null;
  kind: RadioChoice["kind"] = "normal";

  constructor(
    private readonly audio: AudioEngine,
    private readonly seed: number,
  ) {}

  /** Le morceau (composé une seule fois, puis gardé). */
  track(key: string): Track {
    let t = this.tracks.get(key);
    if (!t) {
      let h = this.seed >>> 0;
      for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
      t = composeTrack(key, h >>> 0, key.startsWith("inconnu") ? "unknown" : "normal");
      this.tracks.set(key, t);
    }
    return t;
  }

  update(choice: RadioChoice): void {
    if (!this.ensureBus()) return;
    const ctx = this.audio.ctx!;
    const now = ctx.currentTime;
    const m = choice.muffle;
    this.lowpass!.frequency.setTargetAtTime(5200 * (1 - m) + 380 * m, now, 0.25);
    this.bus!.gain.setTargetAtTime(CONFIG.radio.volume * (1 - 0.55 * m), now, 0.25);

    if (choice.track !== this.current) {
      this.current = choice.track;
      this.kind = choice.kind;
      const tc = CONFIG.radio.crossfadeSeconds / 3;
      for (const d of this.decks.values()) {
        if (d.fadingSince === null) d.fadingSince = now;
        d.gain.gain.setTargetAtTime(0, now, tc);
      }
      if (choice.track) {
        const deck = this.decks.get(choice.track) ?? this.startDeck(choice.track, now);
        deck.fadingSince = null;
        deck.gain.gain.setTargetAtTime(1, now, tc);
      }
    }

    for (const [key, d] of this.decks) {
      if (d.fadingSince !== null && now - d.fadingSince > CONFIG.radio.crossfadeSeconds * 1.6) {
        d.gain.disconnect();
        this.decks.delete(key);
        continue;
      }
      this.schedule(d, now, now + 0.4);
    }
  }

  private ensureBus(): boolean {
    if (!this.audio.ready) return false;
    if (this.bus) return true;
    const ctx = this.audio.ctx!;
    // Petits haut-parleurs de plafond : pas de grave, pas d'aigu.
    this.bus = ctx.createGain();
    this.bus.gain.value = CONFIG.radio.volume;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 170;
    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = "lowpass";
    this.lowpass.frequency.value = 5200;
    this.bus.connect(hp).connect(this.lowpass).connect(this.audio.master!);
    this.epoch = ctx.currentTime;
    return true;
  }

  private startDeck(key: string, now: number): Deck {
    const track = this.track(key);
    const gain = this.audio.ctx!.createGain();
    gain.gain.value = 0;
    gain.connect(this.bus!);
    const deck: Deck = { track, gain, spb: 60 / track.bpm, loopIndex: 0, noteIndex: 0, fadingSince: null };
    this.seek(deck, now);
    this.decks.set(key, deck);
    return deck;
  }

  /** Place la tête de lecture sur la première note après `now`, selon l'horloge commune. */
  private seek(d: Deck, now: number): void {
    const loop = d.track.beats * d.spb;
    d.loopIndex = Math.floor((now - this.epoch) / loop);
    const base = this.epoch + d.loopIndex * loop;
    d.noteIndex = d.track.notes.findIndex((n) => base + n.beat * d.spb >= now + 0.03);
    if (d.noteIndex === -1) {
      d.noteIndex = 0;
      d.loopIndex++;
    }
  }

  private schedule(d: Deck, now: number, until: number): void {
    const notes = d.track.notes;
    const loop = d.track.beats * d.spb;
    let t = this.epoch + d.loopIndex * loop + notes[d.noteIndex].beat * d.spb;
    // En retard de plus d'une seconde (onglet en arrière-plan…) : on se recale au lieu de rattraper.
    if (t < now - 1) {
      this.seek(d, now);
      t = this.epoch + d.loopIndex * loop + notes[d.noteIndex].beat * d.spb;
    }
    while (t <= until) {
      if (t >= now - 0.02) this.play(d, notes[d.noteIndex], Math.max(t, now));
      d.noteIndex++;
      if (d.noteIndex >= notes.length) {
        d.noteIndex = 0;
        d.loopIndex++;
      }
      t = this.epoch + d.loopIndex * loop + notes[d.noteIndex].beat * d.spb;
    }
  }

  private play(d: Deck, n: NoteEvent, t: number): void {
    const ctx = this.audio.ctx!;
    const track = d.track;
    const dur = n.dur * d.spb;
    // Légèrement désaccordé, avec un pleurage de bande (plus fort sur les morceaux inconnus).
    const detune = (Math.random() * 2 - 1) * track.detuneCents + track.wobbleCents * Math.sin(t * 1.3);
    const f = midiToHz(n.midi);
    const out = d.gain;

    switch (n.inst) {
      case "keys": {
        // Piano électrique en synthèse FM : attaque brillante qui s'arrondit.
        const car = ctx.createOscillator();
        const mod = ctx.createOscillator();
        const modGain = ctx.createGain();
        const env = ctx.createGain();
        car.frequency.value = f;
        mod.frequency.value = f;
        car.detune.value = mod.detune.value = detune;
        modGain.gain.setValueAtTime(f * 1.3, t);
        modGain.gain.exponentialRampToValueAtTime(f * 0.15, t + 0.35);
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(n.vel * 0.05, t + 0.006);
        env.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.6);
        mod.connect(modGain).connect(car.frequency);
        car.connect(env).connect(out);
        car.start(t);
        mod.start(t);
        car.stop(t + dur + 0.65);
        mod.stop(t + dur + 0.65);
        break;
      }
      case "lead": {
        // Vibraphone : fondamentale + un partiel aigu qui s'éteint vite.
        const o = ctx.createOscillator();
        const p = ctx.createOscillator();
        const pg = ctx.createGain();
        const env = ctx.createGain();
        o.frequency.value = f;
        p.frequency.value = f * 4;
        o.detune.value = p.detune.value = detune;
        pg.gain.setValueAtTime(0.18, t);
        pg.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(n.vel * 0.11, t + 0.005);
        env.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.1);
        p.connect(pg).connect(env);
        o.connect(env).connect(out);
        o.start(t);
        p.start(t);
        o.stop(t + dur + 1.15);
        p.stop(t + 0.3);
        break;
      }
      case "pad": {
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 900;
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(n.vel * 0.028, t + 0.5);
        env.gain.setValueAtTime(n.vel * 0.028, t + dur);
        env.gain.linearRampToValueAtTime(0, t + dur + 0.5);
        lp.connect(env).connect(out);
        for (const spread of [-8, 8]) {
          const o = ctx.createOscillator();
          o.type = "sawtooth";
          o.frequency.value = f;
          o.detune.value = detune + spread;
          o.connect(lp);
          o.start(t);
          o.stop(t + dur + 0.55);
        }
        break;
      }
      case "bass": {
        const o = ctx.createOscillator();
        o.type = "triangle";
        o.frequency.value = f;
        o.detune.value = detune * 0.5;
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(n.vel * 0.2, t + 0.01);
        env.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.1);
        o.connect(env).connect(out);
        o.start(t);
        o.stop(t + dur + 0.15);
        break;
      }
      case "hat": {
        const src = this.audio.noiseSource(false);
        const hp = ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 7000;
        const env = ctx.createGain();
        env.gain.setValueAtTime(n.vel * 0.025, t);
        env.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
        src.connect(hp).connect(env).connect(out);
        src.start(t, Math.random() * 1.5, 0.07);
        break;
      }
      case "kick": {
        const o = ctx.createOscillator();
        o.frequency.setValueAtTime(115, t);
        o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
        const env = ctx.createGain();
        env.gain.setValueAtTime(n.vel * 0.13, t);
        env.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
        o.connect(env).connect(out);
        o.start(t);
        o.stop(t + 0.22);
        break;
      }
    }
  }
}
