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

  /** Règle 4 : l'autre client. */
  shopper: {
    /** Il apparaît quand Sabine se retrouve enfermée. */
    appearsAtMinutes: 70,
    /** Avant cette heure, il ne s'arrête jamais. 150 = 02:30. */
    stopsFromMinutes: 150,
    corridorSpeed: 1.0,
    /** Dans les allées de rayon, il avance au pas en choisissant ses produits. */
    aisleSpeed: 0.55,
    huntSpeedStart: 2.0,
    huntSpeedMax: 4.3,
    /** Secondes pour passer de huntSpeedStart à huntSpeedMax. */
    huntAcceleration: 6,
    /** Il abandonne la traque s'il ne t'a pas entendu ni vu depuis ce temps. */
    huntGiveUpSeconds: 8,
    /** En dessous de cette distance (m), il t'attrape. */
    catchDistance: 1.1,
    /** Une « rencontre » commence quand tu passes sous cette distance ; on tire alors au sort un arrêt. */
    encounterDistance: 20,
    /** Chance d'arrêt par rencontre, selon l'heure (minutes → probabilité), interpolée. */
    stopChance: [
      [150, 0.35],
      [240, 0.7],
      [300, 0.9],
    ] as [number, number][],
    stopSecondsMin: 8,
    stopSecondsMax: 22,
    /** Au-delà de cet angle (degrés) entre son regard et toi, il se détourne : on ne voit jamais son visage. */
    faceAvoidDegrees: 110,
    turnRate: 5,
  },

  /** Bruit du joueur : rayon (m) dans lequel le client l'entend. */
  noise: {
    walkRadius: 2.5,
    runRadius: 16,
    walkStepLength: 0.75,
    runStepLength: 1.1,
  },

  /** Règle 3 : les néons. */
  neons: {
    /** Client arrêté ou en traque : orange sous ce rayon (m), clignotement au-delà. */
    orangeDistance: 5.5,
    flickerDistance: 11,
    /** Client qui fait ses courses : léger clignotement quand il passe dessous. */
    shoppingFlickerDistance: 3.5,
    /** Quand le magasin bouge à cause de la stagnation, les néons autour vacillent. */
    stagnationFlickerRadius: 10,
    stagnationFlickerSeconds: 1.4,
  },

  /** Règle 2 : les caméras montrent le passé. */
  cameras: {
    /** Décalage en minutes de jeu : oscille entre min et max au fil de la nuit (période en minutes). */
    delayMinMinutes: 2,
    delayMaxMinutes: 4,
    delayPeriodMinutes: 95,
    /** Un instantané de l'état du magasin toutes les N secondes réelles. */
    snapshotSeconds: 0.25,
    /** Ce qu'on garde en mémoire, en minutes de jeu. */
    retentionMinutes: 6,
    /** Résolution des flux (basse, c'est de la vidéosurveillance). */
    feedWidth: 320,
    feedHeight: 208,
    /** Le joueur regarde les écrans s'il est à moins de cette distance (m) du bureau. */
    watchDistance: 4,
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
