import type { Engine } from "@babylonjs/core";
import { el } from "../ui/Hud";
import { drawPlan } from "../ui/PlanRenderer";
import type { StoreLayout } from "../world/StoreLayout";

export interface DebugInfo {
  seed: number;
  time: string;
  x: number;
  z: number;
  yaw: number;
  zone: string;
  speed: number;
  running: boolean;
}

/**
 * Overlay de debug (F1) : infos, mini-carte, raccourcis.
 * Avec l'overlay ouvert : [ et ] reculent / avancent l'horloge de 15 min.
 */
export class Debug {
  private readonly root: HTMLDivElement;
  private readonly text: HTMLPreElement;
  private readonly map: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  visible = false;
  private refresh = 0;

  constructor(
    parent: HTMLElement,
    private readonly engine: Engine,
    private readonly layout: StoreLayout,
  ) {
    this.root = el("div", "debug");
    this.text = el("pre", "debug-text");
    this.map = el("canvas", "debug-map");
    this.map.width = 216;
    this.map.height = 340;
    this.ctx = this.map.getContext("2d")!;
    this.root.append(this.text, this.map);
    parent.append(this.root);
    this.root.style.display = "none";
  }

  toggle(): boolean {
    this.visible = !this.visible;
    this.root.style.display = this.visible ? "" : "none";
    return this.visible;
  }

  update(dt: number, info: DebugInfo): void {
    if (!this.visible) return;
    this.refresh -= dt;
    if (this.refresh > 0) return;
    this.refresh = 0.1;
    this.text.textContent = [
      `RAYON 9 · debug (F1)`,
      `fps        ${this.engine.getFps().toFixed(0)}`,
      `seed       ${info.seed}`,
      `heure      ${info.time}   [ / ] : ±15 min`,
      `position   x ${info.x.toFixed(1)}  z ${info.z.toFixed(1)}`,
      `zone       ${info.zone}`,
      `vitesse    ${info.speed.toFixed(2)} m/s${info.running ? "  (course)" : ""}`,
    ].join("\n");
    drawPlan(this.ctx, this.map.width, this.map.height, this.layout, {
      assignment: this.layout.assignment,
      theme: "debug",
      showHidden: true,
      player: { x: info.x, z: info.z, yaw: info.yaw },
    });
  }
}
