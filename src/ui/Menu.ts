import type { Quality, Settings } from "../core/Settings";
import { el } from "./Hud";

/** Écran titre, pause (avec le trousseau) et options, en DOM par-dessus le canvas. */
export class Menu {
  private readonly title: HTMLDivElement;
  private readonly pause: HTMLDivElement;
  private readonly loading: HTMLDivElement;
  private readonly loadingText: HTMLDivElement;
  private readonly inventory: HTMLUListElement;

  constructor(
    parent: HTMLElement,
    private settings: Settings,
    onStart: () => void,
    onResume: () => void,
    private readonly onSettings: (s: Settings) => void,
  ) {
    this.loading = el("div", "screen loading");
    this.loadingText = el("div", "loading-text", "Allumage des néons…");
    this.loading.append(this.loadingText);

    this.title = el("div", "screen title-screen");
    const box = el("div", "title-box");
    box.append(el("h1", "title", "RAYON 9"), el("p", "subtitle", "Supermarché « Bellevue » · ouvert 24h/24 · nuit du 30 au 31 octobre"));
    const start = el("button", "btn", "Commencer la ronde");
    start.addEventListener("click", onStart);
    box.append(start, el("p", "hint", "Casque recommandé. Le son compte autant que ce que tu vois."), this.optionsPanel(), controls());
    this.title.append(box);

    this.pause = el("div", "screen pause-screen");
    const pbox = el("div", "title-box");
    const resume = el("button", "btn", "Reprendre la ronde");
    resume.addEventListener("click", onResume);
    this.inventory = el("ul", "inventory");
    pbox.append(el("h2", "pause-title", "Pause"), resume, el("h3", "section", "Sur toi"), this.inventory, this.optionsPanel(), controls());
    this.pause.append(pbox);

    parent.append(this.loading, this.title, this.pause);
    this.show("loading");
  }

  show(which: "loading" | "title" | "pause" | "none"): void {
    this.loading.style.display = which === "loading" ? "" : "none";
    this.title.style.display = which === "title" ? "" : "none";
    this.pause.style.display = which === "pause" ? "" : "none";
  }

  setLoadingText(text: string): void {
    this.loadingText.textContent = text;
  }

  setInventory(items: string[]): void {
    this.inventory.replaceChildren(...items.map((i) => el("li", undefined, i)));
  }

  /** Un panneau d'options (il y en a un sur l'écran titre et un dans la pause, synchronisés). */
  private optionsPanel(): HTMLElement {
    const details = el("details", "options");
    details.append(el("summary", undefined, "Options"));
    const s = this.settings;
    const row = (label: string, input: HTMLElement) => {
      const r = el("label", "option-row");
      r.append(el("span", undefined, label), input);
      details.append(r);
    };
    const range = (key: "sensitivity" | "volume" | "fov", min: number, max: number, step: number) => {
      const i = el("input");
      i.type = "range";
      i.min = String(min);
      i.max = String(max);
      i.step = String(step);
      i.value = String(s[key]);
      i.dataset.key = key;
      i.addEventListener("input", () => this.update({ [key]: Number(i.value) }));
      return i;
    };
    row("Sensibilité souris", range("sensitivity", 0.3, 2.5, 0.05));
    row("Volume", range("volume", 0, 1, 0.05));
    row("Champ de vision", range("fov", 60, 95, 1));
    const q = el("select");
    q.dataset.key = "quality";
    for (const [value, label] of [["basse", "Basse (PC modeste)"], ["moyenne", "Moyenne"], ["haute", "Haute"]] as const) {
      const o = el("option", undefined, label);
      o.value = value;
      o.selected = s.quality === value;
      q.append(o);
    }
    q.addEventListener("change", () => this.update({ quality: q.value as Quality }));
    row("Qualité", q);
    const fx = el("input");
    fx.type = "checkbox";
    fx.checked = s.effects;
    fx.dataset.key = "effects";
    fx.addEventListener("change", () => this.update({ effects: fx.checked }));
    row("Grain et aberration", fx);
    return details;
  }

  private update(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch };
    // Garder les deux panneaux synchronisés.
    for (const input of document.querySelectorAll<HTMLInputElement | HTMLSelectElement>(".options [data-key]")) {
      const key = input.dataset.key as keyof Settings;
      if (input instanceof HTMLInputElement && input.type === "checkbox") input.checked = Boolean(this.settings[key]);
      else input.value = String(this.settings[key]);
    }
    this.onSettings(this.settings);
  }
}

function controls(): HTMLElement {
  const list = el("div", "controls");
  const rows: [string, string][] = [
    ["ZQSD / WASD", "se déplacer"],
    ["Maj", "courir (ça s'entend)"],
    ["Souris", "regarder"],
    ["E", "interagir (portes, écrans, plan)"],
    ["T", "appeler Sabine au talkie"],
    ["Tab", "téléphone (photo du plan)"],
    ["Échap", "pause"],
  ];
  for (const [k, v] of rows) {
    const row = el("div", "control-row");
    row.append(el("span", "key", k), el("span", "desc", v));
    list.append(row);
  }
  return list;
}
