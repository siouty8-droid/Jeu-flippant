/**
 * Tous les réglages de gameplay au même endroit.
 * Pour équilibrer le jeu, on touche ici et nulle part ailleurs.
 */
export const CONFIG = {
  /** Graine du magasin. Même graine + mêmes actions = même nuit. */
  seed: 3010,

  clock: {
    /** Secondes réelles pour une heure de jeu. 540 s → la nuit 00:00-06:00 dure 54 min. */
    realSecondsPerGameHour: 540,
    startMinutes: 0,
    endMinutes: 6 * 60,
  },

  player: {
    eyeHeight: 1.68,
    walkSpeed: 2.3,
    runSpeed: 4.8,
    /** Rayon et demi-hauteur de la capsule de collision. */
    radius: 0.32,
    halfHeight: 0.8,
    mouseSensitivity: 1.0,
    fovDegrees: 72,
    headBob: { walkAmplitude: 0.035, runAmplitude: 0.07, walkFrequency: 1.9, runFrequency: 2.8 },
  },

  rendering: {
    /** Nombre de PointLight réelles qui suivent le joueur (le reste des néons est émissif). */
    lightPoolSize: 4,
    lightRange: 11,
    lightIntensity: 0.85,
    ambientIntensity: 0.32,
    fogDensity: 0.018,
    grain: true,
    chromaticAberration: true,
    bloom: true,
  },
} as const;
