/** Réglages du joueur, gardés dans le navigateur (si le stockage est disponible). */
export type Quality = "basse" | "moyenne" | "haute";

export interface Settings {
  sensitivity: number;
  volume: number;
  quality: Quality;
  /** Grain et aberration chromatique. */
  effects: boolean;
  fov: number;
}

const KEY = "rayon9-reglages";
const DEFAULTS: Settings = { sensitivity: 1, volume: 0.9, quality: "moyenne", effects: true, fov: 72 };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    // Stockage indisponible (navigation privée…) : réglages par défaut.
  }
  return { ...DEFAULTS };
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Pas grave : les réglages valent pour cette partie.
  }
}

/** Paramètres de rendu de chaque niveau de qualité. */
export const QUALITY = {
  basse: { msaa: 1, bloom: false, minScale: 1.25, maxScale: 2 },
  moyenne: { msaa: 2, bloom: true, minScale: 1, maxScale: 1.6 },
  haute: { msaa: 4, bloom: true, minScale: 1, maxScale: 1.35 },
} as const;
