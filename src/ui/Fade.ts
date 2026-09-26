import { el } from "./Hud";

/** Fondu au noir plein écran, avec du texte optionnel. */
export class Fade {
  private readonly root: HTMLDivElement;
  private readonly text: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.root = el("div", "fade");
    this.text = el("div", "fade-text");
    this.root.append(this.text);
    parent.append(this.root);
  }

  /** Opacité cible (0 = transparent, 1 = noir) atteinte en `seconds`. */
  to(opacity: number, seconds: number, text = ""): Promise<void> {
    this.root.style.transition = `opacity ${seconds}s ease-in-out`;
    this.root.style.opacity = String(opacity);
    this.text.innerHTML = text;
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  }
}
