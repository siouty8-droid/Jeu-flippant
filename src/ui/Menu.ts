import { el } from "./Hud";

/** Écran titre et écran de pause, en DOM par-dessus le canvas. */
export class Menu {
  private readonly title: HTMLDivElement;
  private readonly pause: HTMLDivElement;
  private readonly loading: HTMLDivElement;

  constructor(parent: HTMLElement, onStart: () => void, onResume: () => void) {
    this.loading = el("div", "screen loading");
    this.loading.append(el("div", "loading-text", "Allumage des néons…"));

    this.title = el("div", "screen title-screen");
    const box = el("div", "title-box");
    box.append(
      el("h1", "title", "RAYON 9"),
      el("p", "subtitle", "Supermarché « Bellevue » · ouvert 24h/24 · nuit du 30 au 31 octobre"),
    );
    const start = el("button", "btn", "Commencer la ronde");
    start.addEventListener("click", onStart);
    box.append(start, controls());
    this.title.append(box);

    this.pause = el("div", "screen pause-screen");
    const pbox = el("div", "title-box");
    const resume = el("button", "btn", "Reprendre la ronde");
    resume.addEventListener("click", onResume);
    pbox.append(el("h2", "pause-title", "Pause"), resume, controls());
    this.pause.append(pbox);

    parent.append(this.loading, this.title, this.pause);
    this.show("loading");
  }

  show(which: "loading" | "title" | "pause" | "none"): void {
    this.loading.style.display = which === "loading" ? "" : "none";
    this.title.style.display = which === "title" ? "" : "none";
    this.pause.style.display = which === "pause" ? "" : "none";
  }
}

function controls(): HTMLElement {
  const list = el("div", "controls");
  const rows: [string, string][] = [
    ["ZQSD / WASD", "se déplacer"],
    ["Maj", "courir (ça s'entend)"],
    ["Souris", "regarder"],
    ["E", "interagir"],
    ["Échap", "pause"],
  ];
  for (const [k, v] of rows) {
    const row = el("div", "control-row");
    row.append(el("span", "key", k), el("span", "desc", v));
    list.append(row);
  }
  return list;
}
