import { CONFIG } from "../config";
import { replayedDisplay } from "../systems/ButcherRegister";
import type { Snapshot } from "../systems/ReplayBuffer";
import { REGISTER_DISPLAY_DX, REGISTER_DISPLAY_Y, REGISTER_X, REGISTER_Z } from "../world/ModuleFactory";
import type { StoreLayout } from "../world/StoreLayout";

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

const BUTCHER = 6;
const CAM_4 = 3;

/**
 * @param code le code de la caisse de la boucherie
 */
export function buildReplayEvents(layout: StoreLayout, code: string): ReplayEvent[] {
  const events: ReplayEvent[] = [
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

  // Le code de la caisse de la boucherie. Toutes les 20 minutes (à 10, 30 et 50), la CAM 4
  // « voit » un vigile en uniforme taper le code, zoome toute seule sur l'afficheur… et montre
  // le magasin tel qu'il était sur le plan. En direct, il n'y avait personne.
  const slot = layout.slots[layout.initialAssignment.indexOf(BUTCHER)];
  const ghost = { x: slot.cx + REGISTER_X - 0.85, z: slot.cz + REGISTER_Z, yaw: Math.PI / 2 };
  // Cadré un peu au-dessus de l'afficheur : on voit aussi la tête du vigile, derrière.
  const target = { x: slot.cx + 2.4 + REGISTER_DISPLAY_DX, y: REGISTER_DISPLAY_Y + 0.2, z: slot.cz + REGISTER_Z };
  const p = CONFIG.puzzles;
  for (let t0 = p.codeFromMinutes; t0 <= p.codeUntilMinutes; t0 += p.codeEveryMinutes) {
    events.push({
      id: "code-boucherie",
      camera: CAM_4,
      from: t0,
      to: t0 + p.codeSceneMinutes,
      apply: (s) => {
        const k = s.t - t0;
        return {
          ...s,
          assignment: [...layout.initialAssignment],
          ghost,
          register: replayedDisplay(code, k),
          ptz: k > 0.08 && k < p.codeSceneMinutes - 0.12 ? { ...target, fov: 0.075 } : undefined,
          alarm: true,
        };
      },
    });
  }
  return events;
}

export function activeEvent(events: readonly ReplayEvent[], camera: number, t: number): ReplayEvent | null {
  return events.find((e) => e.camera === camera && t >= e.from && t <= e.to) ?? null;
}
