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

  /** Règle 1 : les rayons ne sont plus fixes. */
  reshuffle: {
    /** Heure (minutes) à partir de laquelle le magasin bouge. 70 = 01:10, quand Sabine est enfermée. */
    activeFromMinutes: 70,
    evaluationsPerSecond: 4,
    minSecondsBetweenSwaps: 4,
    /** Temps cumulé dans un rayon pour qu'il soit complètement « ancré ». */
    anchorFullSeconds: 90,
    /** Chance qu'un rayon quitté bouge une fois hors de vue : jamais visité → max, très ancré → min. */
    exitMoveChanceMax: 0.75,
    exitMoveChanceMin: 0.08,
    /** Distance minimale entre le joueur et un slot qu'on modifie. */
    playerClearance: 1.5,
    /** Marge ajoutée au cône de vision (degrés) : on ne touche à rien près du bord de l'écran. */
    viewMarginDegrees: 15,
    rayon9AppearsAtMinutes: 150,
    rayon9SecondsBetweenMoves: 25,
  },

  /** La vraie règle : rester sur place fait bouger le magasin autour de toi. */
  stagnation: {
    /** Tant que le joueur reste dans ce rayon (m) autour du même point, il stagne. */
    radius: 1.2,
    /** Seuil en secondes, qui baisse au fil de la nuit. */
    thresholdStart: 8,
    thresholdEnd: 3,
    rampFromMinutes: 70,
    rampToMinutes: 270,
  },

  evacuationPlan: {
    /** Multiplicateur de vitesse quand on regarde la photo du plan sur son téléphone. */
    speedFactorWhileReading: 0.6,
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
