import { SceneInstrumentation, type Engine, type Scene } from "@babylonjs/core";
import { el } from "../ui/Hud";
import { GameClock } from "./GameClock";
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
  stagnation: number;
  stagnationThreshold: number;
  /** Ancrage (0..1) du module présent dans chaque slot, dans l'ordre des slots. */
  anchors: { id: number; anchor: number }[];
  unstable: number[];
  swaps: number;
  lastCause: string | null;
  active: boolean;
  shopper: { state: string; x: number; z: number; lineOfSight: boolean } | null;
  noise: number;
  neonAbove: string;
  loops: number;
  cameraDelay: number;
  replayFrom: number | null;
  story: string[];
  scale: number;
  sabine: string;
  doors: string;
}

/**
 * Overlay de debug (F1) : infos, mini-carte, raccourcis.
 * Avec l'overlay ouvert : [ et ] reculent / avancent l'horloge de 15 min,
 * R force un échange de deux slots cachés, J met le client à l'arrêt devant soi.
 */
export class Debug {
  private readonly root: HTMLDivElement;
  private readonly text: HTMLPreElement;
  private readonly map: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  visible = false;
  private refresh = 0;

  private instrumentation: SceneInstrumentation | null = null;

  constructor(
    parent: HTMLElement,
    private readonly engine: Engine,
    private readonly layout: StoreLayout,
    private readonly scene: Scene,
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

  /** Compteurs de rendu (draw calls, temps de frame). Créés à la première ouverture seulement. */
  get stats(): { drawCalls: number; frameMs: number } {
    if (!this.instrumentation) {
      this.instrumentation = new SceneInstrumentation(this.scene);
      this.instrumentation.captureFrameTime = true;
    }
    return { drawCalls: this.instrumentation.drawCallsCounter.current, frameMs: this.instrumentation.frameTimeCounter.lastSecAverage };
  }

  toggle(): boolean {
    this.visible = !this.visible;
    this.root.style.display = this.visible ? "" : "none";
    return this.visible;
  }

  /** `info` n'est appelée que quand l'overlay est ouvert (pas d'allocations inutiles sinon). */
  update(dt: number, info: () => DebugInfo): void {
    if (!this.visible) return;
    this.refresh -= dt;
    if (this.refresh > 0) return;
    this.refresh = 0.15;
    this.render(info());
  }

  private render(info: DebugInfo): void {
    this.text.textContent = [
      `RAYON 9 · debug (F1)`,
      `fps        ${this.engine.getFps().toFixed(0)}   frame ${this.stats.frameMs.toFixed(1)} ms   draw calls ${this.stats.drawCalls}   résolution ×${(1 / info.scale).toFixed(2)}`,
      `seed       ${info.seed}`,
      `heure      ${info.time}   [ / ] : ±15 min`,
      `position   x ${info.x.toFixed(1)}  z ${info.z.toFixed(1)}`,
      `zone       ${info.zone}`,
      `vitesse    ${info.speed.toFixed(2)} m/s${info.running ? "  (course)" : ""}`,
      ``,
      `magasin    ${info.active ? "INSTABLE" : "normal (avant 01:10)"}   R : forcer un échange`,
      `stagnation ${info.stagnation.toFixed(1)} / ${info.stagnationThreshold.toFixed(1)} s`,
      `échanges   ${info.swaps}${info.lastCause ? `  (dernier : ${info.lastCause})` : ""}`,
      `instables  ${info.unstable.length ? info.unstable.map((s) => `slot ${s}`).join(", ") : "-"}`,
      ``,
      `client     ${info.shopper ? `${info.shopper.state}  x ${info.shopper.x.toFixed(1)} z ${info.shopper.z.toFixed(1)}${info.shopper.lineOfSight ? "  (en vue)" : ""}` : "absent (arrive à 01:10)"}   J : arrêt devant`,
      `bruit      ${info.noise.toFixed(1)} m      néon au-dessus : ${info.neonAbove}`,
      `boucles    ${info.loops}`,
      `caméras    décalage ${info.cameraDelay.toFixed(1)} min · enregistré depuis ${info.replayFrom === null ? "-" : GameClock.format(info.replayFrom)}`,
      `découvert  ${info.story.length ? info.story.join(", ") : "-"}`,
      `sabine     ${info.sabine}`,
      `portes     ${info.doors}`,
      `ancrage    ${info.anchors.map((a) => `${a.id === 0 ? "H" : a.id}:${Math.round(a.anchor * 100)}%`).join(" ")}`,
    ].join("\n");
    drawPlan(this.ctx, this.map.width, this.map.height, this.layout, {
      assignment: this.layout.assignment,
      theme: "debug",
      showHidden: true,
      player: { x: info.x, z: info.z, yaw: info.yaw },
      heat: info.anchors.map((a) => a.anchor),
      shopper: info.shopper ?? undefined,
    });
  }
}
