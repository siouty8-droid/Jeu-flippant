import { el } from "./Hud";

/**
 * Fondu plein écran, avec du texte optionnel. Seul le fond change d'opacité : le texte reste
 * lisible même quand on laisse voir la scène derrière (fins).
 */
export class Fade {
  private readonly root: HTMLDivElement;
  private readonly text: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.root = el("div", "fade");
    this.text = el("div", "fade-text");
    this.root.append(this.text);
    parent.append(this.root);
  }

  /** Opacité du fond (0 = transparent, 1 = noir) atteinte en `seconds`. */
  to(opacity: number, seconds: number, text = ""): Promise<void> {
    this.root.style.transition = `background-color ${seconds}s ease-in-out`;
    this.root.style.backgroundColor = `rgba(0, 0, 0, ${opacity})`;
    this.text.style.transition = `opacity ${Math.min(seconds, 1.2)}s ease-in-out`;
    this.text.style.opacity = text ? "1" : "0";
    if (text) this.text.innerHTML = text;
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  }
}
