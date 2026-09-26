import { GameClock } from "../core/GameClock";
import type { StoreLayout } from "../world/StoreLayout";
import { el } from "./Hud";
import { drawPlan } from "./PlanRenderer";

/**
 * La photo du plan d'évacuation dans le téléphone de Farid (touche Tab).
 * C'est un instantané du plan « d'avant minuit » : il ne se met jamais à jour.
 */
export class EvacuationPlan {
  private readonly root: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly caption: HTMLDivElement;
  private readonly flash: HTMLDivElement;
  isOpen = false;

  constructor(
    parent: HTMLElement,
    private readonly layout: StoreLayout,
  ) {
    this.root = el("div", "phone");
    const screen = el("div", "phone-screen");
    this.canvas = el("canvas", "phone-photo");
    this.canvas.width = 440;
    this.canvas.height = 640;
    this.caption = el("div", "phone-caption");
    screen.append(this.canvas, this.caption);
    this.root.append(screen, el("div", "phone-hint", "[Tab] ranger le téléphone"));
    this.flash = el("div", "camera-flash");
    parent.append(this.root, this.flash);
    this.setOpen(false);
  }

  /** Prend la photo : on dessine le plan une fois pour toutes, avec un rendu « photo de téléphone ». */
  capture(minutes: number): void {
    const ctx = this.canvas.getContext("2d")!;
    const { width: w, height: h } = this.canvas;
    const poster = document.createElement("canvas");
    poster.width = 352;
    poster.height = 512;
    drawPlan(poster.getContext("2d")!, poster.width, poster.height, this.layout, {
      assignment: this.layout.initialAssignment,
      theme: "poster",
      title: "PLAN D'ÉVACUATION",
      youAreHere: { x: 15.25, z: 0.6 },
    });
    // Mur autour de l'affiche, légère rotation, reflet du néon.
    ctx.fillStyle = "#8f8a80";
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-0.025);
    ctx.fillStyle = "#1d1f22";
    ctx.fillRect(-poster.width / 2 - 8, -poster.height / 2 - 8, poster.width + 16, poster.height + 16);
    ctx.filter = "blur(0.4px) contrast(1.05)";
    ctx.drawImage(poster, -poster.width / 2, -poster.height / 2);
    ctx.restore();
    ctx.filter = "none";
    const glare = ctx.createRadialGradient(w * 0.7, h * 0.18, 10, w * 0.7, h * 0.18, w * 0.5);
    glare.addColorStop(0, "rgba(255,255,255,0.35)");
    glare.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glare;
    ctx.fillRect(0, 0, w, h);
    this.caption.textContent = `IMG_3010.jpg · 31/10 · ${GameClock.format(minutes)}`;

    this.flash.classList.remove("on");
    void this.flash.offsetWidth;
    this.flash.classList.add("on");
  }

  setOpen(open: boolean): void {
    this.isOpen = open;
    this.root.classList.toggle("open", open);
  }
}
