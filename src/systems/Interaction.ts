import { type AbstractMesh, type Scene, type UniversalCamera } from "@babylonjs/core";
import type { Hud } from "../ui/Hud";

export interface Interactable {
  /** Texte du prompt, recalculé à chaque visée (peut dépendre de l'état). */
  prompt: () => string | null;
  action: () => void;
}

const REACH = 2.3;

/**
 * Interaction à la touche E : on vise un objet au centre de l'écran, à portée de main.
 * Les murs et les étagères bloquent la visée (on ne prend pas un objet à travers un mur).
 */
export class Interaction {
  private readonly targets = new Map<number, Interactable>();
  private current: Interactable | null = null;
  private sinceCheck = 0;
  enabled = false;

  constructor(
    private readonly scene: Scene,
    private readonly camera: UniversalCamera,
    private readonly hud: Hud,
  ) {
    window.addEventListener("keydown", (e) => {
      if (e.code === "KeyE" && this.enabled && this.current && !e.repeat) this.current.action();
    });
  }

  register(mesh: AbstractMesh, target: Interactable): void {
    this.targets.set(mesh.uniqueId, target);
  }

  update(dt: number): void {
    this.sinceCheck += dt;
    if (this.sinceCheck < 0.1) return;
    this.sinceCheck = 0;
    this.current = null;
    if (this.enabled) {
      const ray = this.camera.getForwardRay(REACH);
      const hit = this.scene.pickWithRay(ray, (m) => m.isPickable && m.isVisible && m.isEnabled());
      if (hit?.pickedMesh) this.current = this.targets.get(hit.pickedMesh.uniqueId) ?? null;
    }
    const text = this.current?.prompt() ?? null;
    this.hud.setPrompt(text);
    if (!text) this.current = null;
  }
}
