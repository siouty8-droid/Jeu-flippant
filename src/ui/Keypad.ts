import { el } from "./Hud";

/** Le clavier de la caisse de la boucherie : quatre cases, un petit écran vert. */
export class Keypad {
  private readonly root: HTMLDivElement;
  private readonly cells: HTMLSpanElement[] = [];
  private readonly status: HTMLDivElement;
  isOpen = false;

  constructor(parent: HTMLElement) {
    this.root = el("div", "keypad");
    const lcd = el("div", "keypad-lcd");
    for (let i = 0; i < 4; i++) {
      const c = el("span", "keypad-cell", "-");
      this.cells.push(c);
      lcd.append(c);
    }
    this.status = el("div", "keypad-status", "");
    this.root.append(el("div", "keypad-title", "CAISSE BOUCHERIE · CODE"), lcd, this.status, el("div", "keypad-hint", "[0-9] taper · [Retour] effacer · [E] laisser"));
    parent.append(this.root);
    this.root.style.display = "none";
  }

  open(): void {
    this.isOpen = true;
    this.root.style.display = "";
    this.show("----");
  }

  close(): void {
    this.isOpen = false;
    this.root.style.display = "none";
  }

  /** `text` : 4 caractères (les chiffres tapés, des tirets pour le reste), ou OUVERT. */
  show(text: string, status: "" | "erreur" | "ok" = ""): void {
    const chars = text === "OUVERT" ? ["O", "K", "", ""] : text.split("");
    this.cells.forEach((c, i) => (c.textContent = chars[i] ?? ""));
    this.status.textContent = status === "erreur" ? "CODE ERRONÉ" : status === "ok" ? "TIROIR OUVERT" : "";
    this.root.classList.toggle("error", status === "erreur");
    this.root.classList.toggle("ok", status === "ok");
  }
}
