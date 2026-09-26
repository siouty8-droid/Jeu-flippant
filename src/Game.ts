import { Color3, Color4, DefaultRenderingPipeline, Engine, Scene, Vector3 } from "@babylonjs/core";
import { CONFIG } from "./config";
import { Debug } from "./core/Debug";
import { EventBus } from "./core/EventBus";
import { GameClock } from "./core/GameClock";
import { Rng } from "./core/Rng";
import { Inventory } from "./player/Inventory";
import { PlayerController } from "./player/PlayerController";
import { DwellTracker } from "./systems/DwellTracker";
import { Interaction } from "./systems/Interaction";
import { EvacuationPlan } from "./ui/EvacuationPlan";
import { Hud } from "./ui/Hud";
import { Menu } from "./ui/Menu";
import { Lighting } from "./world/Lighting";
import { OcclusionMap, type Eye } from "./world/Occlusion";
import { ReshuffleSystem } from "./world/ReshuffleSystem";
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
  readonly inventory = new Inventory();
  readonly dwell = new DwellTracker();
  readonly occlusion: OcclusionMap;
  readonly reshuffle: ReshuffleSystem;
  private readonly lighting: Lighting;
  private readonly interaction: Interaction;
  private readonly hud: Hud;
  private readonly menu: Menu;
  private readonly plan: EvacuationPlan;
  private readonly debug: Debug;
  private state: GameState = "loading";
  private zoneId: string | null = null;
  private zoneLabel = "";

  constructor(
    private readonly canvas: HTMLCanvasElement,
    uiRoot: HTMLElement,
  ) {
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
    this.occlusion = new OcclusionMap(this.layout);
    this.syncOcclusion();
    this.reshuffle = new ReshuffleSystem(this.layout, this.occlusion, this.dwell, this.rng.fork("reshuffle"), this.bus, (slots) => {
      this.world.placeModules();
      this.syncOcclusion();
      for (const s of slots) this.layout.slotChangedAt[s] = this.clock.totalMinutes;
    });

    this.lighting = new Lighting(this.scene, this.world.neons);
    this.player = new PlayerController(this.scene, canvas, SPAWN, 0);
    this.setupPostProcess();

    this.hud = new Hud(uiRoot);
    this.plan = new EvacuationPlan(uiRoot, this.layout);
    this.menu = new Menu(uiRoot, () => this.requestPlay(), () => this.requestPlay());
    this.debug = new Debug(uiRoot, this.engine, this.layout);
    this.interaction = new Interaction(this.scene, this.player.camera, this.hud);
    this.setupInteractables();

    this.bindInput();
    this.bus.on("clock:minute", () => this.hud.setTime(this.clock.format()));
    this.bus.on("zone:enter", ({ previousZoneId }) => {
      const slot = slotIndexOf(previousZoneId);
      if (slot !== null) this.reshuffle.markExited(slot);
    });
    this.hud.setTime(this.clock.format());

    this.scene.onBeforeRenderObservable.add(() => this.tick());
    window.addEventListener("resize", () => this.engine.resize());

    this.scene.executeWhenReady(() => {
      this.setState("title");
      // ?play : démarre direct sans pointer lock (tests automatisés, captures d'écran).
      if (this.skipLock) this.setState("playing");
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

  private setupInteractables(): void {
    this.interaction.register(this.world.planPanel, {
      prompt: () => (this.inventory.has("photo-plan") ? "[E] Reprendre le plan en photo" : "[E] Prendre le plan en photo"),
      action: () => {
        const first = !this.inventory.has("photo-plan");
        this.inventory.add("photo-plan");
        this.plan.capture(this.clock.totalMinutes);
        this.bus.emit("plan:photo", { minutes: this.clock.totalMinutes });
        this.hud.showSubtitle(first ? "Clic. Le plan est dans ton téléphone. [Tab] pour le regarder." : "Clic. Nouvelle photo, même plan.", 5);
      },
    });
  }

  /** Recopie la position des modules dans la carte d'occlusion. */
  private syncOcclusion(): void {
    for (const [id, inst] of this.world.modules) {
      const slot = this.layout.slotOfModule(id);
      this.occlusion.setModule(id, inst.localBoxes, slot === -1 ? null : this.layout.slots[slot]);
    }
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
      if (e.code === "Tab") {
        e.preventDefault();
        if (this.state === "playing" && !e.repeat) this.togglePlan();
      }
      if (this.debug.visible && (e.code === "BracketRight" || e.code === "BracketLeft")) {
        this.clock.set(this.clock.totalMinutes + (e.code === "BracketRight" ? 15 : -15));
        this.hud.setTime(this.clock.format());
      }
      if (this.debug.visible && e.code === "KeyR") this.reshuffle.force();
      if (e.code === "Escape" && this.state === "playing" && this.skipLock) this.setState("paused");
    });
  }

  private togglePlan(): void {
    if (!this.inventory.has("photo-plan")) {
      this.hud.showSubtitle("Pas de photo du plan dans ton téléphone. Il est affiché près de l'entrée.", 4);
      return;
    }
    this.plan.setOpen(!this.plan.isOpen);
    this.player.speedFactor = this.plan.isOpen ? CONFIG.evacuationPlan.speedFactorWhileReading : 1;
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
    const playing = next === "playing";
    this.player.setEnabled(playing);
    this.interaction.enabled = playing;
    if (!playing && this.plan.isOpen) this.togglePlan();
    this.hud.setVisible(playing || next === "paused");
    this.menu.show(next === "title" ? "title" : next === "paused" ? "pause" : next === "loading" ? "loading" : "none");
    this.bus.emit("state:change", { from: prev, to: next });
  }

  /** L'œil du joueur pour les tests de visibilité, cône élargi de la marge de sécurité. */
  private eye(): Eye {
    const cam = this.player.camera;
    const f = cam.getDirection(Vector3.Forward());
    const tanV = Math.tan(cam.fov / 2);
    const tanH = tanV * this.engine.getAspectRatio(cam);
    const diagonal = Math.atan(Math.hypot(tanV, tanH));
    const margin = (CONFIG.reshuffle.viewMarginDegrees * Math.PI) / 180;
    return { x: cam.position.x, y: cam.position.y, z: cam.position.z, forward: { x: f.x, y: f.y, z: f.z }, halfAngle: diagonal + margin };
  }

  private tick(): void {
    const dt = Math.min(0.1, this.engine.getDeltaTime() / 1000);
    const playing = this.state === "playing";
    if (playing) this.clock.update(dt);
    this.player.update(dt);
    this.lighting.update(this.player.position);
    this.interaction.update(dt);
    this.hud.update(dt);

    const p = this.player.position;
    const zone = this.layout.zoneAt(p.x, p.z);
    if (zone.id !== this.zoneId) {
      const previous = this.zoneId;
      this.zoneId = zone.id;
      this.bus.emit("zone:enter", { zoneId: zone.id, previousZoneId: previous });
    }
    this.zoneLabel = zone.label;

    if (playing) {
      const moduleId = zone.slot !== undefined ? this.layout.assignment[zone.slot] : null;
      this.dwell.update(dt, p.x, p.z, moduleId, this.plan.isOpen, this.clock.totalMinutes);
      this.reshuffle.update(dt, this.clock.totalMinutes, this.eye(), { x: p.x, z: p.z });
    }

    this.debug.update(dt, {
      seed: CONFIG.seed,
      time: this.clock.format(),
      x: p.x,
      z: p.z,
      yaw: this.player.yaw,
      zone: this.zoneLabel,
      speed: this.player.speed,
      running: this.player.running,
      stagnation: this.dwell.stagnation,
      stagnationThreshold: DwellTracker.threshold(this.clock.totalMinutes),
      anchors: this.layout.assignment.map((id) => ({ id, anchor: this.dwell.anchor(id) })),
      unstable: this.reshuffle.unstableSlots,
      swaps: this.reshuffle.swapCount,
      lastCause: this.reshuffle.lastCause,
      active: this.clock.totalMinutes >= CONFIG.reshuffle.activeFromMinutes,
    });
  }
}

function slotIndexOf(zoneId: string | null): number | null {
  if (!zoneId?.startsWith("slot-")) return null;
  return Number(zoneId.slice(5));
}
