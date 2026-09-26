import type { AbstractMesh, Scene, UniversalCamera, Vector3 } from "@babylonjs/core";
import type { Hud } from "../ui/Hud";

export interface Interactable {
  /** Texte du prompt, recalculé à chaque visée (peut dépendre de l'état). */
  prompt: () => string | null;
  action: () => void;
}

const REACH = 2.3;

/**
 * Interaction à la touche E : on vise un objet au centre de l'écran, à portée de main.
 *
 * Le rayon ne teste que les objets interactifs (quelques dizaines de meshes au lieu de tout le
 * magasin) ; les murs et les étagères sont vérifiés avec la carte d'occlusion, bien moins chère.
 */
export class Interaction {
  private readonly targets = new Map<number, { mesh: AbstractMesh; target: Interactable }>();
  private current: Interactable | null = null;
  private sinceCheck = 0;
  enabled = false;

  constructor(
    private readonly scene: Scene,
    private readonly camera: UniversalCamera,
    private readonly hud: Hud,
    /** Vrai si un obstacle coupe le segment a → b. */
    private readonly blocked: (a: Vector3, b: Vector3) => boolean,
  ) {
    window.addEventListener("keydown", (e) => {
      if (e.code === "KeyE" && this.enabled && this.current && !e.repeat) this.current.action();
    });
  }

  register(mesh: AbstractMesh, target: Interactable): void {
    this.targets.set(mesh.uniqueId, { mesh, target });
  }

  update(dt: number): void {
    this.sinceCheck += dt;
    if (this.sinceCheck < 0.1) return;
    this.sinceCheck = 0;
    this.current = null;
    if (this.enabled) {
      const ray = this.camera.getForwardRay(REACH);
      const hit = this.scene.pickWithRay(ray, (m) => this.targets.has(m.uniqueId) && m.isEnabled() && m.isVisible);
      if (hit?.pickedMesh && hit.pickedPoint) {
        // On recule un peu le point touché pour ne pas compter l'objet lui-même comme obstacle.
        const to = hit.pickedPoint.add(ray.direction.scale(-0.12));
        if (!this.blocked(ray.origin, to)) this.current = this.targets.get(hit.pickedMesh.uniqueId)!.target;
      }
    }
    const text = this.current?.prompt() ?? null;
    this.hud.setPrompt(text);
    if (!text) this.current = null;
  }
}
