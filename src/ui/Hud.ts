/**
 * HUD minimal : la montre du vigile, les sous-titres du talkie, le prompt d'interaction.
 * Rien d'autre à l'écran, c'est voulu.
 */
export class Hud {
  private readonly root: HTMLDivElement;
  private readonly watch: HTMLDivElement;
  private readonly subtitle: HTMLDivElement;
  private readonly prompt: HTMLDivElement;
  private subtitleTimer = 0;

  constructor(parent: HTMLElement) {
    this.root = el("div", "hud");
    this.watch = el("div", "hud-watch");
    this.subtitle = el("div", "hud-subtitle");
    this.prompt = el("div", "hud-prompt");
    const crosshair = el("div", "hud-crosshair");
    this.root.append(crosshair, this.watch, this.subtitle, this.prompt);
    parent.append(this.root);
    this.setVisible(false);
  }

  setVisible(on: boolean): void {
    this.root.style.display = on ? "" : "none";
  }

  setTime(text: string): void {
    if (this.watch.textContent !== text) this.watch.textContent = text;
  }

  showSubtitle(text: string, seconds = 4): void {
    this.subtitle.textContent = text;
    this.subtitle.classList.add("visible");
    this.subtitleTimer = seconds;
  }

  setPrompt(text: string | null): void {
    this.prompt.textContent = text ?? "";
    this.prompt.classList.toggle("visible", !!text);
  }

  update(dt: number): void {
    if (this.subtitleTimer > 0) {
      this.subtitleTimer -= dt;
      if (this.subtitleTimer <= 0) this.subtitle.classList.remove("visible");
    }
  }
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
}
