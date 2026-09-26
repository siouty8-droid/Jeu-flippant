import { Color3, Color4, DefaultRenderingPipeline, Engine, Scene, Vector3, type Mesh } from "@babylonjs/core";
import { AudioEngine } from "./audio/AudioEngine";
import { drawerOpen, errorBuzz, keyBeep, monitorAlarm, startAmbience } from "./audio/Sounds";
import { StoreRadio } from "./audio/StoreRadio";
import { CONFIG } from "./config";
import { Debug, type DebugInfo } from "./core/Debug";
import { EventBus } from "./core/EventBus";
import { GameClock } from "./core/GameClock";
import { AdaptiveResolution } from "./core/Performance";
import { Rng } from "./core/Rng";
import { QUALITY, loadSettings, saveSettings, type Settings } from "./core/Settings";
import { HIDDEN_ENDING_TEXT, badgeDate, badgeList, endingFor, endingText, hiddenEndingUnlocked, type EndingId } from "./narrative/Endings";
import { Narrative, type NarrativeContext } from "./narrative/Narrative";
import { buildReplayEvents } from "./narrative/ReplayEvents";
import { Talkie } from "./narrative/Talkie";
import { ITEM_NAMES, Inventory, type ItemId } from "./player/Inventory";
import { PlayerController } from "./player/PlayerController";
import { ButcherRegister } from "./systems/ButcherRegister";
import { ColdLock, LOCK_COLOR, registerCode } from "./systems/ColdLock";
import { DwellTracker } from "./systems/DwellTracker";
import { Interaction } from "./systems/Interaction";
import { NeonSystem } from "./systems/NeonSystem";
import { NoiseSystem } from "./systems/NoiseSystem";
import { NpcSystem } from "./systems/Npcs";
import { RadioDirector, type RadioChoice } from "./systems/RadioDirector";
import { ReplayBuffer, cameraDelay } from "./systems/ReplayBuffer";
import { ShopperAI } from "./systems/ShopperAI";
import { EvacuationPlan } from "./ui/EvacuationPlan";
import { Fade } from "./ui/Fade";
import { Hud } from "./ui/Hud";
import { Keypad } from "./ui/Keypad";
import { Menu } from "./ui/Menu";
import { Note } from "./ui/Note";
import { BadgePile } from "./world/BadgePile";
import { CarryView, PLAYER_ONLY_LAYER } from "./world/CarryView";
import { DoorSystem, type Door } from "./world/Doors";
import type { Figure } from "./world/Figure";
import { LcdDisplay } from "./world/LcdDisplay";
import { Lighting } from "./world/Lighting";
import { NavGraph } from "./world/NavGraph";
import { OcclusionMap, type Eye } from "./world/Occlusion";
import { ReshuffleSystem, finalLayout } from "./world/ReshuffleSystem";
import { CAMERAS, SecurityCameras } from "./world/SecurityCameras";
import { RAYON_9, StoreLayout } from "./world/StoreLayout";
import { buildWorld, type World } from "./world/WorldBuilder";

export type GameState = "loading" | "title" | "playing" | "paused" | "looping" | "ending";

/** Là où Farid commence sa ronde : juste après les portes automatiques. */
const SPAWN = { x: 18, z: 2.2, yaw: 0 };
/** Là où il se réveille quand la nuit recommence : au poste de sécurité, face à la porte. */
const LOOP_SPAWN = { x: 3.4, z: 3.9, yaw: Math.PI / 2 };
/** Ordre dans lequel les sorties de secours « renvoient » le joueur dans le magasin (règle 5). */
const EMERGENCY_CYCLE = ["secours-ouest", "secours-est", "secours-reserve"];
/** Le module de la boucherie (sa caisse enregistreuse cache le double de la clé). */
const BUTCHER = 6;
/** Au-delà de cette ligne (devant les portes automatiques), Farid est dehors. */
const OUTSIDE_Z = -0.9;

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
  readonly graph: NavGraph;
  readonly audio = new AudioEngine();
  readonly noise = new NoiseSystem(this.audio);
  readonly neons: NeonSystem;
  readonly shopper: ShopperAI;
  readonly doors: DoorSystem;
  readonly npcs: NpcSystem;
  readonly replay = new ReplayBuffer();
  readonly cameras: SecurityCameras;
  readonly talkie: Talkie;
  readonly narrative: Narrative;
  readonly radio: StoreRadio;
  readonly radioDirector: RadioDirector;
  /** Étape 8 : la caisse de la boucherie et la serrure de la chambre froide. */
  readonly register: ButcherRegister;
  readonly coldLock: ColdLock;
  /** Ce que le joueur a découvert (fin cachée, etc.). Survit aux boucles : c'est sa mémoire à lui. */
  readonly story = new Set<string>();
  /** Nombre de fois où la nuit a recommencé. */
  loops = 0;
  settings: Settings = loadSettings();
  private radioChoice: RadioChoice | null = null;
  private snapshotTimer = 0;
  private ambienceStarted = false;
  private readonly pipeline: DefaultRenderingPipeline;
  private readonly resolution: AdaptiveResolution;
  private readonly fade: Fade;
  private readonly lighting: Lighting;
  private readonly interaction: Interaction;
  private readonly hud: Hud;
  private readonly menu: Menu;
  private readonly plan: EvacuationPlan;
  private readonly keypad: Keypad;
  private readonly note: Note;
  private readonly debug: Debug;
  private readonly registerLcd: LcdDisplay;
  private readonly badges: BadgePile;
  private readonly carryView: CarryView;
  private readonly entranceBlocker: Mesh | null;
  private state: GameState = "loading";
  private zoneId: string | null = null;
  private zoneLabel = "";
  /** Heure d'ouverture du clavier ou de la fiche (le même appui sur E ne doit pas les refermer). */
  private overlayOpenedAt = 0;
  private lastShopperState = "inactive";
  /** Recyclés à chaque frame. */
  private readonly forward = new Vector3();
  private readonly tmpEye: Eye = { x: 0, y: 0, z: 0, forward: { x: 0, y: 0, z: 1 }, halfAngle: 1 };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    uiRoot: HTMLElement,
  ) {
    // Pas d'adaptation au ratio de pixels de l'écran : sur un écran Retina ça quadruple le coût
    // du rendu. La résolution est gérée par AdaptiveResolution et le réglage de qualité.
    this.engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: false, powerPreference: "high-performance" }, false);
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

    this.graph = new NavGraph(this.layout);
    this.lighting = new Lighting(this.scene, this.world.neons);
    this.neons = new NeonSystem(this.scene, this.world.neons, this.audio, this.rng.fork("neons"));
    this.shopper = new ShopperAI(this.scene, this.world.mats, this.graph, this.rng.fork("client"), this.audio, this.occlusion);
    this.doors = new DoorSystem(this.scene, this.world.mats, this.layout, this.occlusion, this.audio);
    this.npcs = new NpcSystem(this.scene, this.graph, this.rng.fork("pnj"));
    this.player = new PlayerController(this.scene, canvas, new Vector3(SPAWN.x, 0, SPAWN.z), SPAWN.yaw);
    this.player.camera.layerMask = 0x0fffffff | PLAYER_ONLY_LAYER;

    // Le code de la caisse ne dépend que de la graine : il reste le même d'une boucle à l'autre.
    this.register = new ButcherRegister(registerCode(new Rng(CONFIG.seed).fork("code-boucherie")));
    this.coldLock = new ColdLock(this.rng.fork("serrure"));
    this.registerLcd = new LcdDisplay(this.scene, "afficheur-caisse");
    for (const d of this.world.modules.get(BUTCHER)?.register?.displays ?? []) d.material = this.registerLcd.material;

    const actors = new Map<string, Figure>(this.npcs.all.map((w) => [w.id, w.figure]));
    this.cameras = new SecurityCameras(this.scene, this.world, this.neons, this.shopper.model, this.replay, this.player.camera, actors, buildReplayEvents(this.layout, this.register.code));
    this.cameras.onAlarm = (k) => this.onCameraAlarm(k);
    this.pipeline = new DefaultRenderingPipeline("post", true, this.scene, [this.player.camera]);
    this.resolution = new AdaptiveResolution(this.engine, 1, 1.6);
    this.badges = new BadgePile(this.scene);
    this.carryView = new CarryView(this.scene, this.player.camera);
    this.entranceBlocker = this.scene.getMeshByName("blocage-entree") as Mesh | null;

    this.hud = new Hud(uiRoot);
    this.plan = new EvacuationPlan(uiRoot, this.layout);
    this.keypad = new Keypad(uiRoot);
    this.note = new Note(uiRoot);
    this.menu = new Menu(uiRoot, this.settings, () => this.requestPlay(), () => this.requestPlay(), (s) => this.applySettings(s));
    this.debug = new Debug(uiRoot, this.engine, this.layout, this.scene);
    this.fade = new Fade(uiRoot);
    this.interaction = new Interaction(this.scene, this.player.camera, this.hud, (a, b) => this.occlusion.blocked(a, b));
    this.talkie = new Talkie(this.audio, this.hud, this.rng.fork("talkie"), () => this.narrative.weakness, () => ({ x: this.npcs.sabine.x, y: 1.5, z: this.npcs.sabine.z }));
    this.narrative = new Narrative(this.audio, this.talkie, this.npcs, this.doors, this.rng.fork("recit"));
    this.radio = new StoreRadio(this.audio, CONFIG.seed);
    this.radioDirector = new RadioDirector(this.layout);
    this.doors.onRelock = () => this.caption("une clenche retombe, au loin");
    this.setupInteractables();
    this.applySettings(this.settings);

    this.bindInput();
    this.bus.on("clock:minute", () => this.hud.setTime(this.clock.format()));
    this.bus.on("clock:dawn", () => void this.finish());
    this.bus.on("store:reshuffle", ({ cause, slots }) => {
      if (cause === "stagnation") {
        const p = this.player.position;
        this.neons.flickerAround(p.x, p.z, CONFIG.neons.stagnationFlickerRadius, CONFIG.neons.stagnationFlickerSeconds);
      }
      if (cause === "rayon9" && slots.some((s) => this.layout.assignment[s] === RAYON_9)) this.narrative.onRayon9();
    });
    this.bus.on("zone:enter", ({ previousZoneId }) => {
      const slot = slotIndexOf(previousZoneId);
      if (slot !== null) this.reshuffle.markExited(slot);
    });
    this.bus.on("radio:unknown", () => this.caption("♪ un air que tu n'as jamais entendu"));

    this.scene.onBeforeRenderObservable.add(() => this.tick());
    window.addEventListener("resize", () => this.engine.resize());

    // Pré-compilation : tout ce qui apparaîtra plus tard est affiché pendant le chargement,
    // pour que ses shaders soient prêts (sinon, à-coup la première fois qu'on le voit).
    this.world.modules.forEach((m) => m.root.setEnabled(true));
    this.shopper.model.setEnabled(true);
    this.cameras.prewarm(true);
    this.carryView.setEnabled(true);
    this.npcs.lamp.setEnabled(true);
    for (const d of this.doors.doors.values()) d.bolt?.setEnabled(true);
    this.menu.setLoadingText("Allumage des néons…");

    this.scene.executeWhenReady(() => {
      this.cameras.prewarm(false);
      this.carryView.setEnabled(false);
      this.startNight(SPAWN);
      this.setState("title");
      // ?play : démarre direct sans pointer lock (tests automatisés, captures d'écran).
      if (this.skipLock) this.setState("playing");
    });
    this.engine.runRenderLoop(() => this.scene.render());
  }

  // ─── Réglages ──────────────────────────────────────────────────────────────

  private applySettings(s: Settings): void {
    this.settings = s;
    saveSettings(s);
    const q = QUALITY[s.quality];
    const p = this.pipeline;
    p.samples = q.msaa;
    p.bloomEnabled = q.bloom && CONFIG.rendering.bloom;
    p.bloomThreshold = 0.75;
    p.bloomWeight = 0.35;
    p.bloomKernel = s.quality === "haute" ? 48 : 32;
    p.bloomScale = 0.5;
    p.grainEnabled = s.effects && CONFIG.rendering.grain;
    p.grain.intensity = 9;
    p.grain.animated = true;
    p.chromaticAberrationEnabled = s.effects && CONFIG.rendering.chromaticAberration;
    p.chromaticAberration.aberrationAmount = 14;
    p.chromaticAberration.radialIntensity = 0.8;
    p.imageProcessingEnabled = true;
    p.imageProcessing.contrast = 1.12;
    p.imageProcessing.exposure = 1.0;
    p.imageProcessing.vignetteEnabled = true;
    p.imageProcessing.vignetteWeight = 2.2;
    p.imageProcessing.vignetteColor = new Color4(0, 0, 0, 0);
    this.resolution.setRange(q.minScale, q.maxScale);
    this.player.camera.fov = (s.fov * Math.PI) / 180;
    this.player.camera.angularSensibility = 2500 / s.sensitivity;
    this.audio.setVolume(s.volume);
  }

  /** Sous-titre d'un son important, si l'option est activée. */
  private caption(text: string): void {
    if (this.settings.captions && this.state === "playing") this.hud.showCaption(text);
  }

  // ─── Interactions ──────────────────────────────────────────────────────────

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
    for (const door of this.doors.doors.values()) {
      for (const leaf of door.leaves) {
        this.interaction.register(leaf.panel, {
          prompt: () => (door.def.id === "froide" && door.bolted ? this.coldLock.prompt() : this.doors.prompt(door, this.inventory)),
          action: () => this.useDoor(door),
        });
      }
    }
    // La caisse de la boucherie : le double de la clé est dans le tiroir.
    const register = this.world.modules.get(BUTCHER)?.register?.proxy;
    if (register) {
      this.interaction.register(register, {
        prompt: () => (this.register.opened ? null : "[E] Taper le code de la caisse"),
        action: () => this.openKeypad(),
      });
    }
    // Sabine, par terre dans la chambre froide.
    for (const m of this.npcs.sabine.figure.root.getChildMeshes()) {
      if (!m.isVisible) continue;
      this.interaction.register(m, {
        prompt: () => (this.narrative.canPickUp ? "[E] Porter Sabine" : null),
        action: () => this.pickUpSabine(),
      });
    }
    this.interaction.register(this.badges.proxy, {
      prompt: () => "[E] Fouiller la pile de badges",
      action: () => this.readBadges(),
    });
  }

  private useDoor(door: Door): void {
    if (door.def.id === "froide" && door.bolted) {
      this.tryColdLock(door);
      return;
    }
    const p = this.player.position;
    const result = this.doors.interact(door, this.inventory, { x: p.x, z: p.z });
    if (result.message) this.hud.showSubtitle(result.message, 4);
  }

  /** La serrure de la chambre froide : verrou neuf, puis serrure qui change (ColdLock). */
  private tryColdLock(door: Door): void {
    const r = this.coldLock.attempt((item) => this.inventory.has(item as ItemId));
    this.hud.showSubtitle(r.message, 5);
    switch (r.result) {
      case "no-double":
        this.narrative.onColdDoorBolted();
        break;
      case "wrong-moment":
        this.narrative.onLockFailed(this.coldLock.failures);
        break;
      case "open":
        // Le verrou saute ; la porte (lourde, elle s'ouvre vers la réserve) s'ouvre ensuite avec E.
        this.doors.unbolt(door);
        this.narrative.onColdRoomOpened();
        break;
    }
  }

  private openKeypad(): void {
    if (this.register.opened) return;
    if (this.plan.isOpen) this.togglePlan();
    if (!this.register.examined) {
      this.register.examined = true;
      this.narrative.onRegisterExamined();
    }
    this.keypad.open();
    this.keypad.show(this.register.display());
    this.overlayOpenedAt = performance.now();
    this.player.setEnabled(false);
    this.interaction.enabled = false;
  }

  private closeOverlays(): void {
    const wasOpen = this.keypad.isOpen || this.note.isOpen;
    this.keypad.close();
    this.note.close();
    if (wasOpen && this.state === "playing" && this.cameras.zoomed === null) {
      this.player.setEnabled(true);
      this.interaction.enabled = true;
    }
  }

  private registerPosition(): Vector3 {
    return this.world.modules.get(BUTCHER)?.register?.register.getAbsolutePosition() ?? Vector3.Zero();
  }

  private pressDigit(digit: string): void {
    const pos = this.registerPosition();
    keyBeep(this.audio, pos);
    const r = this.register.press(digit);
    if (r === "more") {
      this.keypad.show(this.register.display());
      this.registerLcd.set(this.register.display());
      return;
    }
    if (r === "wrong") {
      this.keypad.show("----", "erreur");
      this.registerLcd.set("ERR");
      setTimeout(() => errorBuzz(this.audio, pos), 90);
      setTimeout(() => this.registerLcd.set(this.register.display()), 900);
      return;
    }
    this.keypad.show("OUVERT", "ok");
    this.registerLcd.set("OUVERT");
    drawerOpen(this.audio, pos);
    this.inventory.add("double-froide");
    this.story.add("code-boucherie");
    this.narrative.onRegisterOpened();
    setTimeout(() => this.closeOverlays(), 1100);
  }

  /** La pile de badges du local technique : l'un d'eux est au nom de Farid. */
  private readBadges(): void {
    if (this.plan.isOpen) this.togglePlan();
    this.note.open("Badges d'employés, en vrac", badgeList(this.loops));
    this.overlayOpenedAt = performance.now();
    this.player.setEnabled(false);
    this.interaction.enabled = false;
    if (!this.story.has("badges-farid")) {
      this.story.add("badges-farid");
      this.narrative.onBadgesFound();
    }
  }

  /** Farid prend Sabine sur son dos. Le magasin se redessine pour le retour. */
  private pickUpSabine(): void {
    if (!this.narrative.canPickUp) return;
    this.narrative.pickUp();
    this.player.carrying = true;
    this.dwell.thresholdScale = CONFIG.carry.stagnationFactor;
    this.carryView.setEnabled(true);
    // Le chemin du retour est entièrement redessiné, sauf un chemin d'emplacements qui reste
    // comme sur le plan (et où la radio passe les morceaux connus). Le client l'évite.
    const { target, stable } = finalLayout(this.layout.assignment, this.layout.initialAssignment, this.rng.fork(`fin-${this.loops}`));
    this.reshuffle.setTarget(target, stable);
    for (const s of stable) this.graph.avoidStable.add(s);
    // L'entrée s'ouvre enfin.
    if (this.entranceBlocker) this.entranceBlocker.checkCollisions = false;
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

  /** Une caméra détecte un « mouvement » qui n'existe pas : le poste bipe. */
  private onCameraAlarm(k: number): void {
    if (this.zoneId !== "securite" || this.state !== "playing") return;
    const monitor = this.cameras.monitorMeshes[k];
    monitorAlarm(this.audio, monitor.getAbsolutePosition());
    this.caption(`bip · mouvement sur la ${CAMERAS[k].name}`);
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
      this.audio.setVolume(this.settings.volume);
      startAmbience(this.audio);
    }
  }

  private bindInput(): void {
    window.addEventListener("pointerdown", () => this.startAudio());
    document.addEventListener("pointerlockchange", () => {
      const locked = document.pointerLockElement === this.canvas;
      if (this.state === "looping" || this.state === "ending") return;
      if (locked && this.state !== "playing") this.setState("playing");
      if (!locked && this.state === "playing" && !this.skipLock) this.setState("paused");
    });
    window.addEventListener("keydown", (e) => {
      this.startAudio();
      if (e.code === "F1") {
        e.preventDefault();
        this.bus.emit("debug:toggle", { visible: this.debug.toggle() });
      }
      // Clavier de la caisse ou fiche ouverte : les chiffres vont à la caisse, E range.
      if (this.keypad.isOpen || this.note.isOpen) {
        if (e.code === "Tab" || e.code === "Backspace") e.preventDefault();
        if (e.repeat || performance.now() - this.overlayOpenedAt < 150) return;
        const digit = /^(Digit|Numpad)([0-9])$/.exec(e.code);
        if (this.keypad.isOpen && digit && !this.register.opened) this.pressDigit(digit[2]);
        else if (this.keypad.isOpen && e.code === "Backspace") {
          this.register.erase();
          this.keypad.show(this.register.display());
          this.registerLcd.set(this.register.display());
        } else if (e.code === "KeyE" || e.code === "Tab" || e.code === "Escape") this.closeOverlays();
        if (e.code !== "Escape") return;
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
      if (e.code === "KeyT" && this.state === "playing" && !e.repeat) this.narrative.call(this.narrativeContext());
      if (this.debug.visible) this.debugKey(e.code);
      if (e.code === "Escape" && this.state === "playing" && this.skipLock) this.setState("paused");
    });
  }

  /** Raccourcis du mode debug (overlay F1 ouvert). */
  private debugKey(code: string): void {
    if (code === "BracketRight" || code === "BracketLeft") {
      this.clock.set(this.clock.totalMinutes + (code === "BracketRight" ? 15 : -15));
      this.hud.setTime(this.clock.format());
    }
    if (code === "KeyR") this.reshuffle.force();
    if (code === "KeyJ") {
      const p = this.player.position;
      this.shopper.debugStopAhead(p.x, p.z, this.player.yaw);
    }
    // K : le double de la clé ; L : la serrure de la chambre froide cède (si Sabine est enfermée).
    if (code === "KeyK") this.inventory.add("double-froide");
    if (code === "KeyL" && this.narrative.locked) {
      this.coldLock.open = true;
      const door = this.doors.get("froide");
      this.doors.unbolt(door);
      this.doors.setOpen(door, true);
      this.narrative.onColdRoomOpened();
    }
  }

  private togglePlan(): void {
    if (!this.plan.isOpen && !this.inventory.has("photo-plan")) {
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

  /** Reprend la partie après une séquence (boucle, aube) : sans pointer lock, on passe par la pause. */
  private resume(): void {
    if (this.skipLock || document.pointerLockElement === this.canvas) this.setState("playing");
    else this.setState("paused");
  }

  private setState(next: GameState): void {
    if (next === this.state) return;
    const prev = this.state;
    this.state = next;
    const playing = next === "playing";
    if (!playing) {
      this.unzoomCamera();
      this.closeOverlays();
    }
    this.player.setEnabled(playing);
    this.interaction.enabled = playing;
    if (!playing && this.plan.isOpen) this.togglePlan();
    if (next === "paused") this.menu.setInventory(this.inventory.list().map((i) => ITEM_NAMES[i]));
    this.hud.setVisible(playing || next === "looping");
    this.menu.show(next === "title" ? "title" : next === "paused" ? "pause" : next === "loading" ? "loading" : "none");
    this.bus.emit("state:change", { from: prev, to: next });
  }

  // ─── Nuit ──────────────────────────────────────────────────────────────────

  /** Remet le magasin et tout le monde dans l'état de 00:00. */
  private startNight(spawn: { x: number; z: number; yaw: number }): void {
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
    this.inventory.startNight();
    this.replay.clear();
    this.unzoomCamera();
    this.closeOverlays();
    this.cameras.hideEpilogue();
    this.doors.reset();
    this.narrative.reset(this.loops);
    this.register.reset();
    this.registerLcd.set(this.register.display());
    this.coldLock.reset();
    this.radioDirector.reset();
    this.graph.avoidStable.clear();
    this.player.carrying = false;
    this.carryView.setEnabled(false);
    if (this.entranceBlocker) this.entranceBlocker.checkCollisions = true;
    this.badges.setCount(badgeList(this.loops).length);
    this.setDaylight(false);
    if (this.plan.isOpen) this.togglePlan();
    this.player.teleport(spawn.x, spawn.z, spawn.yaw);
    this.player.camera.rotation.x = 0;
  }

  /**
   * Le client t'a rattrapé. Pas d'animation d'attaque, pas de game over :
   * noir, silence, et Farid se réveille au poste de sécurité à 00:00. La nuit recommence.
   */
  private async loopNight(): Promise<void> {
    if (this.state === "looping") return;
    this.setState("looping");
    this.bus.emit("shopper:caught", {});
    this.talkie.clear();
    this.audio.setMuted(true, 0.3);
    await this.fade.to(1, 0.35);
    await wait(2200);

    this.loops++;
    this.startNight(LOOP_SPAWN);
    const badge = badgeDate(this.loops);
    this.fade.to(1, 0.01, `<div class="big">00:00</div><div>Poste de sécurité.</div><div class="small">Badge : FARID — agent de sécurité — depuis le ${badge}</div>`);
    await wait(3200);
    this.audio.setMuted(false, 2);
    this.resume();
    await this.fade.to(0, 2.2);
    this.bus.emit("night:loop", { count: this.loops });
  }

  /**
   * Fin de la nuit : dehors avec Sabine (fin normale), ou 06:00 (normale si Farid la porte,
   * le froid sinon). Le magasin au petit matin, le texte, puis la fin cachée si Farid a trouvé
   * les deux indices.
   */
  private async finish(exited = false): Promise<void> {
    if (this.state === "ending" || this.state === "looping") return;
    const id: EndingId = endingFor({ carried: this.narrative.carried, exited });
    const time = this.clock.format();
    this.setState("ending");
    this.talkie.clear();
    this.audio.setMuted(true, 1.5);
    await this.fade.to(1, exited ? 1.5 : 2.5);

    this.morningScene(id);
    this.audio.setMuted(false, 3);
    await this.fade.to(0.62, 2.5, `<div class="ending">${endingText(id, { carried: this.narrative.carried, exited, time })}</div>`);
    await wait(9000);

    if (hiddenEndingUnlocked(this.story)) await this.hiddenEnding();
    else await this.fade.to(1, 2);

    this.loops++;
    this.startNight(SPAWN);
    this.setState("title");
    this.audio.setMuted(false, 1);
    await this.fade.to(0, 1.5);
  }

  /** Le magasin au petit matin : tout est à sa place, la lumière du jour entre par les vitrines. */
  private morningScene(id: EndingId): void {
    this.layout.assignment = [...this.layout.initialAssignment];
    this.world.placeModules();
    this.syncOcclusion();
    this.shopper.deactivate();
    this.reshuffle.reset();
    this.doors.reset();
    this.carryView.setEnabled(false);
    for (const c of this.npcs.customers) c.walker.figure.setEnabled(false);
    this.npcs.sabine.figure.setEnabled(false);
    this.npcs.lamp.setEnabled(false);
    this.setDaylight(true);
    if (id === "sauvee") {
      // Sur le parking, face aux vitrines.
      this.player.teleport(18, -9, 0);
      this.player.camera.rotation.x = -0.06;
    } else {
      // Dans la réserve, face à la chambre froide ouverte, vide et propre.
      const door = this.doors.get("froide");
      door.locked = false;
      this.doors.setOpen(door, true, { instant: true, silent: true });
      this.player.teleport(20.5, 54.6, Math.atan2(14 - 20.5, 53.8 - 54.6));
      this.player.camera.rotation.x = 0.05;
    }
  }

  /** Dernière image : la CAM 0 montre, en différé, Farid lui-même en train de regarder les écrans. */
  private async hiddenEnding(): Promise<void> {
    await this.fade.to(1, 2);
    this.audio.setMuted(true, 1);
    this.setDaylight(false);
    this.player.teleport(LOOP_SPAWN.x, LOOP_SPAWN.z, LOOP_SPAWN.yaw);
    this.cameras.showEpilogue(badgeDate(this.loops), 3 * 60 + 12, this.layout.initialAssignment);
    this.story.add("fin-cachee");
    await this.fade.to(0, 2);
    await wait(7000);
    await this.fade.to(1, 2.5, `<div class="hidden-ending">${HIDDEN_ENDING_TEXT}</div>`);
    await wait(5500);
    this.cameras.hideEpilogue();
    await this.fade.to(1, 1);
  }

  private setDaylight(on: boolean): void {
    this.lighting.setDaylight(on);
    // Le parking, noir la nuit, gris au petit matin.
    this.world.mats.asphalt.diffuseColor = on ? new Color3(0.36, 0.37, 0.39) : Color3.FromHexString("#15161a");
    this.scene.clearColor = on ? new Color4(0.62, 0.68, 0.76, 1) : new Color4(0.02, 0.025, 0.035, 1);
    this.scene.fogColor = on ? new Color3(0.6, 0.64, 0.7) : new Color3(0.05, 0.055, 0.065);
    this.scene.fogDensity = on ? 0.006 : CONFIG.rendering.fogDensity;
  }

  /** Il a franchi une sortie de secours ouverte… et se retrouve à une autre, à l'intérieur. */
  private emergencyLoop(from: Door): void {
    const i = EMERGENCY_CYCLE.indexOf(from.def.id);
    const to = this.doors.get(EMERGENCY_CYCLE[(i + 1) % EMERGENCY_CYCLE.length]);
    this.doors.setOpen(from, false, { instant: true, lock: true, silent: true });
    this.doors.setOpen(to, true, { instant: true, silent: true });
    const n = to.normal;
    this.player.teleport(to.def.x - n.x * 1.1, to.def.z - n.z * 1.1, Math.atan2(-n.x, -n.z));
    this.narrative.onEmergencyLoop();
  }

  private narrativeContext(): NarrativeContext {
    const p = this.player.position;
    const b = this.shopper.brain;
    const cold = this.doors.get("froide").center;
    return {
      minutes: this.clock.totalMinutes,
      player: { x: p.x, z: p.z },
      zoneId: this.zoneId ?? "",
      loops: this.loops,
      hasPhoto: this.inventory.has("photo-plan"),
      shopperActive: b.active,
      shopperState: b.state,
      shopperDistance: b.active ? Math.hypot(b.x - p.x, b.z - p.z) : Infinity,
      shopperInSight: this.shopper.lineOfSight,
      neonAbove: this.neons.stateAt(p.x, p.z),
      coldDoorSeen: this.canSee(cold),
      hasDouble: this.inventory.has("double-froide"),
      registerExamined: this.register.examined,
      lockLook: this.coldLock.look,
      lockFailures: this.coldLock.failures,
    };
  }

  /** Le joueur voit-il ce point (dans le champ et sans obstacle) ? */
  private canSee(target: Vector3): boolean {
    const cam = this.player.camera;
    const to = target.subtract(cam.position);
    const dist = to.length();
    if (dist > 35) return false;
    this.player.camera.getDirectionToRef(Vector3.Forward(), this.forward);
    if (Vector3.Dot(to.scaleInPlace(1 / dist), this.forward) < Math.cos(this.halfFovH() + 0.15)) return false;
    return !this.occlusion.blocked(cam.position, target);
  }

  private halfFovH(): number {
    const cam = this.player.camera;
    return Math.atan(Math.tan(cam.fov / 2) * this.engine.getAspectRatio(cam));
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
      actors: this.npcs.all.map((w) => ({ id: w.id, x: w.x, z: w.z, yaw: w.yaw, on: w.active, sitting: w.sitting && w.speed === 0 })),
    });
  }

  /** L'œil du joueur pour les tests de visibilité, cône élargi de la marge de sécurité. */
  private eye(): Eye {
    const cam = this.player.camera;
    cam.getDirectionToRef(Vector3.Forward(), this.forward);
    const tanV = Math.tan(cam.fov / 2);
    const tanH = tanV * this.engine.getAspectRatio(cam);
    const e = this.tmpEye;
    e.x = cam.position.x;
    e.y = cam.position.y;
    e.z = cam.position.z;
    e.forward = { x: this.forward.x, y: this.forward.y, z: this.forward.z };
    e.halfAngle = Math.atan(Math.hypot(tanV, tanH)) + (CONFIG.reshuffle.viewMarginDegrees * Math.PI) / 180;
    return e;
  }

  // ─── Boucle ────────────────────────────────────────────────────────────────

  private tick(): void {
    const dt = Math.min(0.1, this.engine.getDeltaTime() / 1000);
    const playing = this.state === "playing";
    this.resolution.update(dt);
    if (playing) this.clock.update(dt);
    this.player.update(dt);
    const cam = this.player.camera;
    const eyeNow = cam.position;
    cam.getDirectionToRef(Vector3.Forward(), this.forward);
    this.audio.setListener(eyeNow, this.forward);
    this.interaction.update(dt);
    this.hud.update(dt);
    if (playing) this.talkie.update(dt);
    this.carryView.update(dt, this.player.speed);

    const p = this.player.position;
    const zone = this.layout.zoneAt(p.x, p.z);
    if (zone.id !== this.zoneId) {
      const previous = this.zoneId;
      this.zoneId = zone.id;
      this.bus.emit("zone:enter", { zoneId: zone.id, previousZoneId: previous });
    }
    this.zoneLabel = zone.label;

    const minutes = this.clock.totalMinutes;
    const crossed = this.doors.update(dt, eyeNow, this.forward, this.halfFovH(), { x: p.x, z: p.z });
    if (playing) {
      if (crossed) this.emergencyLoop(crossed);
      if (this.player.carrying && p.z < OUTSIDE_Z) void this.finish(true);
      else if (!this.player.carrying && p.z < 0.75 && p.x > 16 && p.x < 20) this.narrative.onEntranceBlocked();

      const moduleId = zone.slot !== undefined ? this.layout.assignment[zone.slot] : null;
      const reading = this.plan.isOpen || this.cameras.zoomed !== null || this.keypad.isOpen || this.note.isOpen;
      this.dwell.update(dt, p.x, p.z, moduleId, reading, minutes);
      const b = this.shopper.brain;
      const avoid = [...(b.active ? [{ x: b.x, z: b.z }] : []), ...this.npcs.all.filter((w) => w.active).map((w) => ({ x: w.x, z: w.z }))];
      this.reshuffle.update(dt, minutes, this.eye(), { x: p.x, z: p.z }, avoid);
      this.noise.update(dt, this.player.speed, this.player.running);
      this.updateColdLock(dt);

      // Règle 4 : le client arrive quand Sabine est enfermée, et va d'abord au rayon des conserves.
      if (!b.active && minutes >= CONFIG.shopper.appearsAtMinutes) {
        const conserves = this.layout.slotOfModule(3);
        this.shopper.activate({ x: p.x, z: p.z }, conserves === -1 ? null : conserves);
      }
      this.shopper.update(dt, minutes, { x: eyeNow.x, y: eyeNow.y, z: eyeNow.z }, this.noise.radius);
      if (this.shopper.state === "caught") void this.loopNight();
      if (this.shopper.state === "stopped" && this.lastShopperState !== "stopped" && Math.hypot(b.x - p.x, b.z - p.z) < 25) {
        this.caption("les roulettes s'arrêtent");
      }
      this.lastShopperState = this.shopper.state;

      this.narrative.update(dt, this.narrativeContext());
      this.recordSnapshot(dt, minutes);
    }

    for (const id of this.cameras.update(dt, minutes, zone.id === "securite", eyeNow, this.forward)) {
      this.story.add(id);
      this.bus.emit("cameras:witnessed", { id });
    }
    if (this.cameras.zoomed !== null) this.hud.setPrompt("[← →] changer de caméra · [E] revenir");

    this.updateRadio(p.x, p.z, zone.id, minutes);

    const b = this.shopper.brain;
    this.neons.update(dt, b.active ? { x: b.x, z: b.z, state: b.state } : null, { x: p.x, z: p.z });
    this.lighting.update(p, (i) => this.neons.light(i));

    this.debug.update(dt, () => this.debugInfo());
  }

  /** Étape 8 : la serrure de la chambre froide change quand on ne la regarde pas. */
  private updateColdLock(dt: number): void {
    const door = this.doors.get("froide");
    if (!door.bolted) return;
    const seen = this.canSee(door.center);
    if (this.coldLock.update(dt, this.dwell.stagnation, this.inventory.has("double-froide"), seen)) {
      this.doors.setLockColor(door, LOCK_COLOR[this.coldLock.look]);
    }
  }

  /** Étape 7 : la radio du magasin suit le joueur de zone en zone. */
  private updateRadio(x: number, z: number, zoneId: string, minutes: number): void {
    const r = CONFIG.radio;
    const haunted = this.narrative.locked && minutes >= r.hauntedFromMinutes && minutes < r.hauntedToMinutes;
    const choice = this.radioDirector.choose(x, z, zoneId, haunted);
    const previous = this.radioChoice;
    this.radioChoice = choice;
    this.radio.update(choice);
    if (previous && choice.track !== previous.track && choice.kind === "unknown" && previous.kind === "normal" && choice.muffle < 0.5) {
      this.bus.emit("radio:unknown", { track: choice.track! });
    }
  }

  private debugInfo(): DebugInfo {
    const p = this.player.position;
    const minutes = this.clock.totalMinutes;
    const froide = this.doors.get("froide");
    const radio = this.radioChoice;
    return {
      seed: CONFIG.seed,
      time: this.clock.format(),
      x: p.x,
      z: p.z,
      yaw: this.player.yaw,
      zone: this.zoneLabel,
      speed: this.player.speed,
      running: this.player.running,
      stagnation: this.dwell.stagnation,
      stagnationThreshold: DwellTracker.threshold(minutes) * this.dwell.thresholdScale,
      anchors: this.layout.assignment.map((id) => ({ id, anchor: this.dwell.anchor(id) })),
      unstable: this.reshuffle.unstableSlots,
      swaps: this.reshuffle.swapCount,
      lastCause: this.reshuffle.lastCause,
      active: minutes >= CONFIG.reshuffle.activeFromMinutes,
      shopper: this.shopper.brain.active ? { state: this.shopper.state, ...this.shopper.position, lineOfSight: this.shopper.lineOfSight } : null,
      noise: this.noise.radius,
      neonAbove: this.neons.stateAt(p.x, p.z),
      loops: this.loops,
      cameraDelay: cameraDelay(minutes),
      replayFrom: this.replay.oldest,
      story: [...this.story],
      scale: this.resolution.level,
      sabine: this.narrative.carried
        ? `portée · ${this.narrative.temperature.toFixed(0)} °`
        : this.narrative.freed
          ? "libérée"
          : this.narrative.locked
            ? `enfermée · ${this.narrative.temperature.toFixed(0)} °${this.narrative.silent ? " · silence" : ""}`
            : "libre",
      doors: `froide ${froide.bolted ? "verrou" : froide.isOpen ? "ouverte" : "fermée"} · secours ${EMERGENCY_CYCLE.map((id) => (this.doors.get(id).isOpen ? "O" : "F")).join("")}`,
      radio: radio?.track ? `${radio.track}${radio.slot !== null ? ` (slot ${radio.slot})` : ""}${radio.muffle > 0 ? ` · étouffée ${Math.round(radio.muffle * 100)} %` : ""}` : "silence",
      puzzle: `code ${this.register.code}${this.register.opened ? " (ouvert)" : ""} · serrure ${this.coldLock.look} · sans stagner ${Math.min(99, this.coldLock.sinceStall).toFixed(0)} s${this.reshuffle.converging ? " · redessin final" : ""}`,
    };
  }
}

function slotIndexOf(zoneId: string | null): number | null {
  if (!zoneId?.startsWith("slot-")) return null;
  return Number(zoneId.slice(5));
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
