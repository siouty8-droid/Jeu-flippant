import { el } from "./Hud";

/** Une fiche à lire (la pile de badges…) : on la range avec E. Lire, c'est stagner. */
export class Note {
  private readonly root: HTMLDivElement;
  isOpen = false;

  constructor(parent: HTMLElement) {
    this.root = el("div", "note");
    parent.append(this.root);
    this.root.style.display = "none";
  }

  /** Une ligne peut être mise en évidence (`!` devant le texte). */
  open(title: string, lines: string[]): void {
    this.isOpen = true;
    const rows = lines.map((l) => (l.startsWith("!") ? el("div", "note-line farid", l.slice(1)) : el("div", "note-line", l)));
    this.root.replaceChildren(el("div", "note-title", title), ...rows, el("div", "note-hint", "[E] reposer"));
    this.root.style.display = "";
  }

  close(): void {
    this.isOpen = false;
    this.root.style.display = "none";
  }
}
