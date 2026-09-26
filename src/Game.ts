import { Color3, Color4, DefaultRenderingPipeline, Engine, Scene, Vector3 } from "@babylonjs/core";
import { CONFIG } from "./config";
import { Debug } from "./core/Debug";
import { EventBus } from "./core/EventBus";
import { GameClock } from "./core/GameClock";
import { Rng } from "./core/Rng";
import { PlayerController } from "./player/PlayerController";
import { Hud } from "./ui/Hud";
import { Menu } from "./ui/Menu";
import { Lighting } from "./world/Lighting";
import { StoreLayout } from "./world/StoreLayout";
import { buildWorld, type World } from "./world/WorldBuilder";

export type GameState = "loading" | "title" | "playing" | "paused" | "ending";

/** Là où Farid commence sa ronde : juste après les portes automatiques. */
const SPAWN = new Vector3(18, 0, 2.2);

export class Game {
  readonly bus = new EventBus();
  readonly engine: Engine;
  readonly scene: Scene;
  readonly layout = new StoreLayout();
  readonly rng = new Rng(CONFIG.seed);
  readonly clock = new GameClock(this.bus);
  readonly world: World;
  readonly player: PlayerController;
  private readonly lighting: Lighting;
  private readonly hud: Hud;
  private readonly menu: Menu;
  private readonly debug: Debug;
  private state: GameState = "loading";
  private zoneId: string | null = null;
  private zoneLabel = "";

  constructor(private readonly canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: false }, true);
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.02, 0.025, 0.035, 1);
    this.scene.ambientColor = new Color3(0.1, 0.1, 0.1);
    this.scene.collisionsEnabled = true;
    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogDensity = CONFIG.rendering.fogDensity;
    this.scene.fogColor = new Color3(0.05, 0.055, 0.065);
    this.scene.skipPointerMovePicking = true;

    this.world = buildWorld(this.scene, this.layout, this.rng);
    this.lighting = new Lighting(this.scene, this.world.neons);
    this.player = new PlayerController(this.scene, canvas, SPAWN, 0);
    this.setupPostProcess();

    this.hud = new Hud(uiRoot);
    this.menu = new Menu(uiRoot, () => this.requestPlay(), () => this.requestPlay());
    this.debug = new Debug(uiRoot, this.engine, this.layout);

    this.bindInput();
    this.bus.on("clock:minute", () => this.hud.setTime(this.clock.format()));
    this.hud.setTime(this.clock.format());

    this.scene.onBeforeRenderObservable.add(() => this.tick());
    window.addEventListener("resize", () => this.engine.resize());

    this.scene.executeWhenReady(() => {
      this.setState("title");
      // ?play : démarre direct sans pointer lock (tests automatisés, captures d'écran).
      if (new URLSearchParams(location.search).has("play")) this.setState("playing");
    });
    this.engine.runRenderLoop(() => this.scene.render());
  }

  private setupPostProcess(): void {
    const r = CONFIG.rendering;
    const pipeline = new DefaultRenderingPipeline("post", true, this.scene, [this.player.camera]);
    pipeline.samples = 4;
    pipeline.bloomEnabled = r.bloom;
    pipeline.bloomThreshold = 0.75;
    pipeline.bloomWeight = 0.35;
    pipeline.bloomKernel = 48;
    pipeline.grainEnabled = r.grain;
    pipeline.grain.intensity = 9;
    pipeline.grain.animated = true;
    pipeline.chromaticAberrationEnabled = r.chromaticAberration;
    pipeline.chromaticAberration.aberrationAmount = 14;
    pipeline.chromaticAberration.radialIntensity = 0.8;
    pipeline.imageProcessingEnabled = true;
    pipeline.imageProcessing.contrast = 1.12;
    pipeline.imageProcessing.exposure = 1.0;
    pipeline.imageProcessing.vignetteEnabled = true;
    pipeline.imageProcessing.vignetteWeight = 2.2;
    pipeline.imageProcessing.vignetteColor = new Color4(0, 0, 0, 0);
  }

  private bindInput(): void {
    document.addEventListener("pointerlockchange", () => {
      const locked = document.pointerLockElement === this.canvas;
      if (locked && this.state !== "playing") this.setState("playing");
      if (!locked && this.state === "playing" && !this.skipLock) this.setState("paused");
    });
    window.addEventListener("keydown", (e) => {
      if (e.code === "F1") {
        e.preventDefault();
        this.bus.emit("debug:toggle", { visible: this.debug.toggle() });
      }
      if (this.debug.visible && (e.code === "BracketRight" || e.code === "BracketLeft")) {
        this.clock.set(this.clock.totalMinutes + (e.code === "BracketRight" ? 15 : -15));
        this.hud.setTime(this.clock.format());
      }
      if (e.code === "Escape" && this.state === "playing" && this.skipLock) this.setState("paused");
    });
  }

  private get skipLock(): boolean {
    return new URLSearchParams(location.search).has("play");
  }

  private requestPlay(): void {
    if (this.skipLock) {
      this.setState("playing");
      return;
    }
    const req = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
    // Certains navigateurs refusent le lock (iframe, headless) : on joue quand même.
    req?.catch?.(() => this.setState("playing"));
  }

  private setState(next: GameState): void {
    if (next === this.state) return;
    const prev = this.state;
    this.state = next;
    this.player.setEnabled(next === "playing");
    this.hud.setVisible(next === "playing" || next === "paused");
    this.menu.show(next === "title" ? "title" : next === "paused" ? "pause" : next === "loading" ? "loading" : "none");
    this.bus.emit("state:change", { from: prev, to: next });
  }

  private tick(): void {
    const dt = Math.min(0.1, this.engine.getDeltaTime() / 1000);
    if (this.state === "playing") this.clock.update(dt);
    this.player.update(dt);
    this.lighting.update(this.player.position);
    this.hud.update(dt);

    const p = this.player.position;
    const zone = this.layout.zoneAt(p.x, p.z);
    if (zone.id !== this.zoneId) {
      const previous = this.zoneId;
      this.zoneId = zone.id;
      this.bus.emit("zone:enter", { zoneId: zone.id, previousZoneId: previous });
    }
    this.zoneLabel = zone.label;

    this.debug.update(dt, {
      seed: CONFIG.seed,
      time: this.clock.format(),
      x: p.x,
      z: p.z,
      yaw: this.player.yaw,
      zone: this.zoneLabel,
      speed: this.player.speed,
      running: this.player.running,
    });
  }
}
