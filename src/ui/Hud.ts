/**
 * HUD minimal : la montre du vigile, les sous-titres du talkie, le prompt d'interaction.
 * Rien d'autre à l'écran, c'est voulu.
 */
export class Hud {
  private readonly root: HTMLDivElement;
  private readonly watch: HTMLDivElement;
  private readonly subtitle: HTMLDivElement;
  private readonly prompt: HTMLDivElement;
  private readonly crosshair: HTMLDivElement;
  private readonly caption: HTMLDivElement;
  private subtitleTimer = 0;
  private captionTimer = 0;

  constructor(parent: HTMLElement) {
    this.root = el("div", "hud");
    this.watch = el("div", "hud-watch");
    this.subtitle = el("div", "hud-subtitle");
    this.prompt = el("div", "hud-prompt");
    this.crosshair = el("div", "hud-crosshair");
    this.caption = el("div", "hud-caption");
    this.root.append(this.crosshair, this.watch, this.subtitle, this.prompt, this.caption);
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
    this.showLine(null, text, "info", seconds);
  }

  /** Réplique sous-titrée. `kind` : talkie (grésille), direct (à côté de toi), inner (pensée), info. */
  showLine(speaker: string | null, text: string, kind: "talkie" | "direct" | "inner" | "info", seconds: number): void {
    this.subtitle.replaceChildren();
    this.subtitle.className = `hud-subtitle visible ${kind}`;
    if (speaker) this.subtitle.append(el("span", "speaker", speaker));
    this.subtitle.append(el("span", "line", text));
    this.subtitleTimer = seconds;
  }

  /** Sous-titre d'un son important (option d'accessibilité), en haut de l'écran. */
  showCaption(text: string, seconds = 3.5): void {
    this.caption.textContent = `[${text}]`;
    this.caption.classList.add("visible");
    this.captionTimer = seconds;
  }

  /** Le viseur grossit quand on vise un objet. */
  setAiming(on: boolean): void {
    this.crosshair.classList.toggle("aim", on);
  }

  setPrompt(text: string | null): void {
    if (this.prompt.textContent !== (text ?? "")) this.prompt.textContent = text ?? "";
    this.prompt.classList.toggle("visible", !!text);
    this.setAiming(!!text);
  }

  update(dt: number): void {
    if (this.captionTimer > 0) {
      this.captionTimer -= dt;
      if (this.captionTimer <= 0) this.caption.classList.remove("visible");
    }
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
