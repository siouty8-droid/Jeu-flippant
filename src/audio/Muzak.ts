import { Rng } from "../core/Rng";

/**
 * Composition procédurale de la muzak du magasin (logique pure, sans Web Audio).
 *
 * Un morceau « normal » : tempo lent, mode majeur, accords de septième un peu lounge,
 * mélodie simple qui répète son motif. Un morceau « inconnu » : même instrumentation,
 * mais mineur (ou phrygien), avec des intervalles de travers, un peu trop lent et plus désaccordé.
 * Tout est seedé : un même morceau sonne pareil à chaque fois qu'on repasse dans sa zone.
 */

export type Instrument = "keys" | "lead" | "pad" | "bass" | "hat" | "kick";

export interface NoteEvent {
  /** Début, en temps (noires) depuis le début de la boucle. */
  beat: number;
  /** Durée en temps. */
  dur: number;
  midi: number;
  /** 0..1 */
  vel: number;
  inst: Instrument;
}

export interface Track {
  id: string;
  bpm: number;
  /** Longueur de la boucle, en temps. */
  beats: number;
  /** Trié par `beat`. */
  notes: NoteEvent[];
  /** Désaccord aléatoire par note (cents, ±). */
  detuneCents: number;
  /** Pleurage de bande (cents) : un morceau inconnu « tangue ». */
  wobbleCents: number;
  minor: boolean;
  /** Tonique (MIDI) et gamme, en demi-tons depuis la tonique. */
  root: number;
  scale: readonly number[];
}

export type TrackKind = "normal" | "unknown";

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];

/** Progressions de 8 mesures, en degrés de la gamme (0 = tonique). */
const MAJOR_PROGRESSIONS = [
  [0, 5, 3, 4, 0, 5, 1, 4],
  [0, 3, 4, 0, 5, 1, 4, 4],
  [0, 2, 3, 4, 0, 2, 3, 4],
  [3, 4, 2, 5, 1, 4, 0, 0],
  [0, 5, 1, 4, 0, 3, 4, 0],
];
const MINOR_PROGRESSIONS = [
  [0, 5, 3, 4, 0, 5, 1, 4],
  [0, 3, 0, 4, 5, 3, 4, 0],
  [0, 6, 5, 4, 0, 6, 1, 4],
];

/** Rythmes de mélodie sur deux mesures (débuts en temps, durées). */
const MOTIFS: [number, number][][] = [
  [[0, 1], [1, 0.5], [1.5, 0.5], [2, 2], [4, 1.5], [5.5, 0.5], [6, 2]],
  [[0, 0.5], [0.5, 0.5], [1, 1], [2.5, 1.5], [4, 1], [5, 1], [6, 1.5]],
  [[1, 1], [2, 1], [3, 1], [4, 3], [7, 1]],
  [[0, 1.5], [1.5, 0.5], [2, 1], [3, 1], [4, 2], [6, 1], [7, 0.5]],
];

/** Accompagnement des claviers dans une mesure. */
const COMPS: [number, number][][] = [
  [[1, 0.8], [3, 0.8]],
  [[0, 1.4], [1.5, 0.4], [2.5, 1.2]],
  [[0.5, 0.4], [1.5, 0.4], [2.5, 0.4], [3.5, 0.4]],
];

/** Hauteur MIDI du degré `step` (peut dépasser l'octave) d'une gamme. */
function degree(root: number, scale: readonly number[], step: number): number {
  const oct = Math.floor(step / 7);
  const i = ((step % 7) + 7) % 7;
  return root + oct * 12 + scale[i];
}

export function composeTrack(id: string, seed: number, kind: TrackKind): Track {
  const rng = new Rng(seed);
  const unknown = kind === "unknown";
  const scale = unknown ? (rng.chance(0.5) ? MINOR : PHRYGIAN) : MAJOR;
  // Un morceau inconnu est « légèrement trop lent ».
  const bpm = Math.round(unknown ? rng.range(58, 68) : rng.range(72, 90));
  const root = 50 + rng.int(0, 9);
  const progA = rng.pick(unknown ? MINOR_PROGRESSIONS : MAJOR_PROGRESSIONS);
  const progB = rng.pick(unknown ? MINOR_PROGRESSIONS : MAJOR_PROGRESSIONS);
  const bars = [...progA, ...progB];
  const motif = rng.pick(MOTIFS);
  const comp = rng.pick(COMPS);
  const bossa = rng.chance(0.4);
  const sevenths = rng.chance(0.7);
  const notes: NoteEvent[] = [];
  const add = (beat: number, dur: number, midi: number, vel: number, inst: Instrument) => notes.push({ beat, dur, midi, vel, inst });

  // Contour de la mélodie, rejoué à chaque paire de mesures et recalé sur l'accord.
  const contour = motif.map(() => rng.int(-2, 4));

  bars.forEach((deg, bar) => {
    const b0 = bar * 4;
    const chord = [deg, deg + 2, deg + 4, ...(sevenths ? [deg + 6] : [])];
    const chordMidi = chord.map((s) => degree(root, scale, s));

    // Nappe : l'accord tenu toute la mesure.
    for (const m of chordMidi.slice(0, 3)) add(b0, 4, m, 0.35, "pad");
    // Claviers : l'accord plaqué selon le motif d'accompagnement, une octave au-dessus.
    for (const [t, d] of comp) for (const m of chordMidi) add(b0 + t, d, m + 12, 0.5, "keys");
    // Basse : fondamentale, quinte, parfois une note de passage.
    const bassRoot = degree(root, scale, deg) - 12;
    add(b0, 1.5, bassRoot, 0.8, "bass");
    add(b0 + 2, 1, bassRoot + (unknown && rng.chance(0.3) ? 6 : 7), 0.6, "bass");
    if (rng.chance(0.5)) add(b0 + 3.5, 0.5, bassRoot + (rng.chance(0.5) ? 5 : -1), 0.45, "bass");
    // Batterie feutrée.
    for (let h = 0; h < 8; h++) add(b0 + h * 0.5, 0.1, 0, h % 2 === 0 ? 0.5 : 0.28, "hat");
    for (const k of bossa ? [0, 1.5, 2, 3.5] : [0, 2]) add(b0 + k, 0.2, 0, 0.6, "kick");

    // Mélodie : une paire de mesures sur deux reprend le motif, l'autre le varie.
    if (bar % 2 === 0) {
      const phrase = bar % 8;
      const cadence = phrase === 6;
      motif.forEach(([t, d], i) => {
        // Temps forts : note de l'accord ; ailleurs : la gamme, en suivant le contour.
        const strong = t % 2 === 0;
        let step = deg + (strong ? [0, 2, 4][Math.abs(contour[i]) % 3] : contour[i]) + 7;
        if (phrase === 4) step += 1;
        if (cadence && i === motif.length - 1) step = 7; // fin de phrase sur la tonique
        let midi = degree(root, scale, step) + 12;
        if (unknown && rng.chance(0.18)) midi += rng.pick([1, 6, -6]);
        // Un morceau inconnu perd des notes et traîne un peu derrière le temps.
        if (unknown && rng.chance(0.12)) return;
        const late = unknown ? rng.range(0, 0.08) : 0;
        add(b0 + t + late, d * 0.95, midi, 0.7, "lead");
      });
    }
  });

  notes.sort((a, b) => a.beat - b.beat);
  return {
    id,
    bpm,
    beats: bars.length * 4,
    notes,
    detuneCents: unknown ? 22 : 6,
    wobbleCents: unknown ? 28 : 4,
    minor: unknown,
    root,
    scale,
  };
}

/** Fréquence d'une note MIDI. */
export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
