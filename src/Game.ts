import { Color3, Color4, DefaultRenderingPipeline, Engine, Scene, Vector3 } from "@babylonjs/core";
import { AudioEngine } from "./audio/AudioEngine";
import { startAmbience } from "./audio/Sounds";
import { CONFIG } from "./config";
import { Debug } from "./core/Debug";
import { EventBus } from "./core/EventBus";
import { GameClock } from "./core/GameClock";
import { Rng } from "./core/Rng";
import { Inventory } from "./player/Inventory";
import { PlayerController } from "./player/PlayerController";
import { DwellTracker } from "./systems/DwellTracker";
import { Interaction } from "./systems/Interaction";
import { NeonSystem } from "./systems/NeonSystem";
import { NoiseSystem } from "./systems/NoiseSystem";
import { ReplayBuffer, cameraDelay } from "./systems/ReplayBuffer";
import { ShopperAI } from "./systems/ShopperAI";
import { EvacuationPlan } from "./ui/EvacuationPlan";
import { Fade } from "./ui/Fade";
import { Hud } from "./ui/Hud";
import { Menu } from "./ui/Menu";
import { Lighting } from "./world/Lighting";
import { NavGraph } from "./world/NavGraph";
import { OcclusionMap, type Eye } from "./world/Occlusion";
import { ReshuffleSystem } from "./world/ReshuffleSystem";
import { CAMERAS, SecurityCameras } from "./world/SecurityCameras";
import { StoreLayout } from "./world/StoreLayout";
import { buildWorld, type World } from "./world/WorldBuilder";

export type GameState = "loading" | "title" | "playing" | "paused" | "looping" | "ending";

/** Là où Farid commence sa ronde : juste après les portes automatiques. */
const SPAWN = new Vector3(18, 0, 2.2);
/** Là où il se réveille quand la nuit recommence : au poste de sécurité, face à la porte. */
const LOOP_SPAWN = { x: 3.4, z: 3.9, yaw: Math.PI / 2 };

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
  readonly audio = new AudioEngine();
  readonly noise = new NoiseSystem(this.audio);
  readonly neons: NeonSystem;
  readonly shopper: ShopperAI;
  readonly replay = new ReplayBuffer();
  readonly cameras: SecurityCameras;
  /** Ce que le joueur a découvert (fin cachée, etc.). Survit aux boucles : c'est sa mémoire à lui. */
  readonly story = new Set<string>();
  /** Nombre de fois où la nuit a recommencé. */
  loops = 0;
  private snapshotTimer = 0;
  private ambienceStarted = false;
  private readonly fade: Fade;
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
    this.neons = new NeonSystem(this.world.neons, this.audio, this.rng.fork("neons"));
    this.shopper = new ShopperAI(this.scene, this.world.mats, new NavGraph(this.layout), this.rng.fork("client"), this.audio, this.occlusion);
    this.player = new PlayerController(this.scene, canvas, SPAWN, 0);
    this.cameras = new SecurityCameras(this.scene, this.world, this.neons, this.shopper.model, this.replay, this.player.camera);
    this.setupPostProcess();

    this.hud = new Hud(uiRoot);
    this.plan = new EvacuationPlan(uiRoot, this.layout);
    this.menu = new Menu(uiRoot, () => this.requestPlay(), () => this.requestPlay());
    this.debug = new Debug(uiRoot, this.engine, this.layout);
    this.fade = new Fade(uiRoot);
    this.interaction = new Interaction(this.scene, this.player.camera, this.hud);
    this.setupInteractables();

    this.bindInput();
    this.bus.on("clock:minute", () => this.hud.setTime(this.clock.format()));
    this.bus.on("store:reshuffle", ({ cause }) => {
      if (cause === "stagnation") {
        const p = this.player.position;
        this.neons.flickerAround(p.x, p.z, CONFIG.neons.stagnationFlickerRadius, CONFIG.neons.stagnationFlickerSeconds);
      }
    });
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
    this.cameras.monitorMeshes.forEach((monitor, k) => {
      this.interaction.register(monitor, {
        prompt: () => `[E] Regarder la ${CAMERAS[k].name}`,
        action: () => this.zoomCamera(k),
      });
    });
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

  private zoomCamera(k: number): void {
    this.cameras.zoom(k);
    this.player.setEnabled(false);
    this.interaction.enabled = false;
  }

  private unzoomCamera(): void {
    if (this.cameras.zoomed === null) return;
    this.cameras.unzoom();
    const playing = this.state === "playing";
    this.player.setEnabled(playing);
    this.interaction.enabled = playing;
  }

  /** Recopie la position des modules dans la carte d'occlusion. */
  private syncOcclusion(): void {
    for (const [id, inst] of this.world.modules) {
      const slot = this.layout.slotOfModule(id);
      this.occlusion.setModule(id, inst.localBoxes, slot === -1 ? null : this.layout.slots[slot]);
    }
  }

  /** L'audio ne peut démarrer qu'après un geste de l'utilisateur. */
  private startAudio(): void {
    this.audio.start();
    if (this.audio.ctx && !this.ambienceStarted) {
      this.ambienceStarted = true;
      startAmbience(this.audio);
    }
  }

  private bindInput(): void {
    window.addEventListener("pointerdown", () => this.startAudio());
    document.addEventListener("pointerlockchange", () => {
      const locked = document.pointerLockElement === this.canvas;
      if (this.state === "looping") return;
      if (locked && this.state !== "playing") this.setState("playing");
      if (!locked && this.state === "playing" && !this.skipLock) this.setState("paused");
    });
    window.addEventListener("keydown", (e) => {
      this.startAudio();
      if (e.code === "F1") {
        e.preventDefault();
        this.bus.emit("debug:toggle", { visible: this.debug.toggle() });
      }
      if (this.cameras.zoomed !== null) {
        // Vue plein écran d'une caméra : E / Tab / Échap pour revenir, ← → pour changer.
        if (e.code === "Tab") e.preventDefault();
        if (performance.now() - this.cameras.zoomedAt < 150 || e.repeat) return;
        if (e.code === "KeyE" || e.code === "Tab" || e.code === "Escape") this.unzoomCamera();
        else if (e.code === "ArrowLeft" || e.code === "KeyA") this.cameras.zoom(this.cameras.zoomed - 1);
        else if (e.code === "ArrowRight" || e.code === "KeyD") this.cameras.zoom(this.cameras.zoomed + 1);
        if (e.code !== "Escape") return;
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
      if (this.debug.visible && e.code === "KeyJ") {
        const p = this.player.position;
        this.shopper.debugStopAhead(p.x, p.z, this.player.yaw);
      }
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
    this.startAudio();
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
    if (!playing) this.unzoomCamera();
    this.player.setEnabled(playing);
    this.interaction.enabled = playing;
    if (!playing && this.plan.isOpen) this.togglePlan();
    this.hud.setVisible(playing || next === "paused" || next === "looping");
    this.menu.show(next === "title" ? "title" : next === "paused" ? "pause" : next === "loading" ? "loading" : "none");
    this.bus.emit("state:change", { from: prev, to: next });
  }

  /**
   * Le client t'a rattrapé. Pas d'animation d'attaque, pas de game over :
   * noir, silence, et Farid se réveille au poste de sécurité à 00:00. La nuit recommence.
   */
  private async loopNight(): Promise<void> {
    if (this.state === "looping") return;
    this.setState("looping");
    this.bus.emit("shopper:caught", {});
    this.audio.setMuted(true, 0.3);
    await this.fade.to(1, 0.35);
    await wait(2200);

    this.loops++;
    this.resetNight();
    const badge = badgeDate(this.loops);
    this.fade.to(
      1,
      0.01,
      `<div class="big">00:00</div><div>Poste de sécurité.</div><div class="small">Badge : FARID — agent de sécurité — depuis le ${badge}</div>`,
    );
    await wait(3200);
    this.audio.setMuted(false, 2);
    this.setState("playing");
    await this.fade.to(0, 2.2);
    this.bus.emit("night:loop", { count: this.loops });
  }

  /** Un instantané de l'état du magasin pour les caméras (règle 2). */
  private recordSnapshot(dt: number, minutes: number): void {
    this.snapshotTimer -= dt;
    if (this.snapshotTimer > 0) return;
    this.snapshotTimer = CONFIG.cameras.snapshotSeconds;
    const p = this.player.position;
    const b = this.shopper.brain;
    this.replay.push({
      t: minutes,
      assignment: [...this.layout.assignment],
      player: { x: p.x, z: p.z, yaw: this.player.yaw },
      shopper: b.active ? { x: b.x, z: b.z, yaw: b.bodyYaw, state: b.state, speed: b.speed } : null,
      neons: this.neons.captureStates(),
    });
  }

  /** Remet le magasin tel qu'il était avant minuit. */
  private resetNight(): void {
    this.clock.set(0);
    this.hud.setTime(this.clock.format());
    this.layout.assignment = [...this.layout.initialAssignment];
    this.layout.slotChangedAt.fill(-1);
    this.world.placeModules();
    this.syncOcclusion();
    this.dwell.reset();
    this.reshuffle.reset();
    this.shopper.deactivate();
    this.noise.reset();
    this.inventory.clear();
    this.replay.clear();
    this.unzoomCamera();
    if (this.plan.isOpen) this.togglePlan();
    this.player.teleport(LOOP_SPAWN.x, LOOP_SPAWN.z, LOOP_SPAWN.yaw);
    this.player.camera.rotation.x = 0;
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
    const eyeNow = this.player.camera.position;
    this.audio.setListener(eyeNow, this.player.camera.getDirection(Vector3.Forward()));
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

    const minutes = this.clock.totalMinutes;
    if (playing) {
      const moduleId = zone.slot !== undefined ? this.layout.assignment[zone.slot] : null;
      this.dwell.update(dt, p.x, p.z, moduleId, this.plan.isOpen, minutes);
      this.reshuffle.update(dt, minutes, this.eye(), { x: p.x, z: p.z });
      this.noise.update(dt, this.player.speed, this.player.running);

      // Règle 4 : le client arrive quand Sabine est enfermée, et va d'abord au rayon des conserves.
      if (!this.shopper.brain.active && minutes >= CONFIG.shopper.appearsAtMinutes) {
        const conserves = this.layout.slotOfModule(3);
        this.shopper.activate({ x: p.x, z: p.z }, conserves === -1 ? null : conserves);
      }
      this.shopper.update(dt, minutes, { x: eyeNow.x, y: eyeNow.y, z: eyeNow.z }, this.noise.radius);
      if (this.shopper.state === "caught") void this.loopNight();
    }
    if (playing) this.recordSnapshot(dt, minutes);
    const forward = this.player.camera.getDirection(Vector3.Forward());
    for (const id of this.cameras.update(dt, minutes, zone.id === "securite", eyeNow, forward)) {
      this.story.add(id);
      this.bus.emit("cameras:witnessed", { id });
    }
    if (this.cameras.zoomed !== null) this.hud.setPrompt("[← →] changer de caméra · [E] revenir");

    const threat = this.shopper.brain.active ? { ...this.shopper.position, state: this.shopper.state } : null;
    this.neons.update(dt, threat, { x: p.x, z: p.z });
    this.lighting.update(this.player.position, (i) => this.neons.light(i));

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
      shopper: this.shopper.brain.active ? { state: this.shopper.state, ...this.shopper.position, lineOfSight: this.shopper.lineOfSight } : null,
      noise: this.noise.radius,
      neonAbove: this.neons.stateAt(p.x, p.z),
      loops: this.loops,
      cameraDelay: cameraDelay(minutes),
      replayFrom: this.replay.oldest,
      story: [...this.story],
    });
  }
}

function slotIndexOf(zoneId: string | null): number | null {
  if (!zoneId?.startsWith("slot-")) return null;
  return Number(zoneId.slice(5));
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Date d'embauche sur le badge. La première nuit : il y a trois semaines.
 * À chaque boucle, elle recule encore de trois semaines.
 */
export function badgeDate(loops: number): string {
  const d = new Date(Date.UTC(2025, 9, 31));
  d.setUTCDate(d.getUTCDate() - 21 * (loops + 1));
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
