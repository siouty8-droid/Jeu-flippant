import type { Snapshot } from "../systems/ReplayBuffer";

/**
 * Événements injectés dans le replay d'une caméra : ce que la caméra « a vu »
 * alors qu'en direct, il n'y avait rien. Seule cette caméra les montre.
 */
export interface ReplayEvent {
  id: string;
  /** Index de la caméra (0 = CAM 1). */
  camera: number;
  /** Fenêtre en heure de jeu (minutes) du moment rejoué. */
  from: number;
  to: number;
  apply(s: Snapshot): Snapshot;
}

export const REPLAY_EVENTS: ReplayEvent[] = [
  {
    // Fin cachée, indice 1 : entre 03:18 et 03:23, le client s'arrête dans l'allée centrale
    // et regarde droit dans l'objectif de la CAM 2. En direct, personne à cet endroit.
    id: "client-objectif",
    camera: 1,
    from: 198,
    to: 203,
    apply: (s) => ({ ...s, shopper: { x: 31.2, z: 22.5, yaw: Math.PI / 2, state: "stopped", speed: 0, lookAtLens: true } }),
  },
];

export function activeEvent(camera: number, t: number): ReplayEvent | null {
  return REPLAY_EVENTS.find((e) => e.camera === camera && t >= e.from && t <= e.to) ?? null;
}
