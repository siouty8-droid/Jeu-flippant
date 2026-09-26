import {
  Color4,
  DynamicTexture,
  Effect,
  FreeCamera,
  Mesh,
  MeshBuilder,
  RenderTargetTexture,
  Scene,
  ShaderMaterial,
  TransformNode,
  Vector3,
  type AbstractMesh,
  type Material,
  type UniversalCamera,
} from "../babylon";
import { CONFIG } from "../config";
import { GameClock } from "../core/GameClock";
import { activeEvent, type ReplayEvent } from "../narrative/ReplayEvents";
import type { NeonSystem } from "../systems/NeonSystem";
import { cameraDelay, type ReplayBuffer, type Snapshot } from "../systems/ReplayBuffer";
import { CCTV_ONLY_LAYER, buildFaridModel } from "./FaridModel";
import type { Figure } from "./Figure";
import { LcdDisplay } from "./LcdDisplay";
import { mat } from "./Materials";
import { consolidate } from "./Merge";
import type { ShopperModel } from "./ShopperModel";
import type { World } from "./WorldBuilder";

interface CamDef {
  name: string;
  label: string;
  pos: [number, number, number];
  target: [number, number, number];
}

/** Six caméras au plafond. L'ordre correspond aux écrans : CAM 1-3 en haut, CAM 4-6 en bas. */
export const CAMERAS: readonly CamDef[] = [
  { name: "CAM 1", label: "ENTRÉE / CAISSES", pos: [34.6, 3.75, 0.7], target: [18, 0.4, 8] },
  { name: "CAM 2", label: "ALLÉE CENTRALE", pos: [35.4, 3.75, 22.5], target: [8, 0.6, 22.5] },
  { name: "CAM 3", label: "ALLÉE DU FOND", pos: [0.6, 3.75, 34.5], target: [28, 0.6, 34.5] },
  { name: "CAM 4", label: "MUR DU FOND", pos: [35.4, 3.75, 48.4], target: [6, 0.4, 44] },
  { name: "CAM 5", label: "ALLÉE B", pos: [23.5, 3.75, 9.8], target: [23.5, 0.4, 45] },
  { name: "CAM 6", label: "RÉSERVE", pos: [35.4, 3.5, 58.4], target: [16, 0.4, 50] },
];

/**
 * Une caméra qui n'existe pas : au plafond du poste de sécurité, tournée vers les écrans.
 * Elle ne passe sur aucun moniteur ; elle ne sert qu'à la dernière image de la fin cachée.
 */
const EPILOGUE_CAMERA: CamDef = { name: "CAM 0", label: "POSTE DE SÉCURITÉ", pos: [5.6, 3.35, 5.55], target: [0.9, 1.25, 3.0] };

Effect.ShadersStore["cctvVertexShader"] = `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
uniform mat4 worldViewProjection;
varying vec2 vUV;
void main(void) {
  vUV = uv;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}`;

Effect.ShadersStore["cctvFragmentShader"] = `
precision highp float;
varying vec2 vUV;
uniform sampler2D feed;
uniform sampler2D overlay;
uniform float time;
uniform float signal;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(void) {
  vec2 uv = vUV;
  float line = floor(uv.y * 208.0);
  float jitter = (hash(vec2(line, floor(time * 12.0))) - 0.5) * 0.003;
  vec3 c = texture2D(feed, vec2(uv.x + jitter, uv.y)).rgb;
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  lum = pow(clamp(lum * 1.7, 0.0, 1.0), 0.85);
  float n = hash(uv * 400.0 + vec2(time * 17.0, time * 31.0));
  lum += (n - 0.5) * 0.13;
  lum *= 0.82 + 0.18 * sin(uv.y * 650.0);
  float roll = smoothstep(0.0, 0.02, abs(fract(uv.y - time * 0.07) - 0.5));
  lum *= 0.9 + 0.1 * roll;
  vec3 col = vec3(lum * 0.72, lum, lum * 0.78);
  vec2 d = uv - 0.5;
  col *= 1.0 - dot(d, d) * 1.3;
  col = mix(vec3(n * 0.55), col, signal);
  vec4 o = texture2D(overlay, uv);
  col = mix(col, o.rgb, o.a);
  gl_FragColor = vec4(col, 1.0);
}`;

interface Feed {
  def: CamDef;
  camera: FreeCamera;
  rtt: RenderTargetTexture;
  material: ShaderMaterial;
  overlay: DynamicTexture;
  overlayKey: string;
  /** Instant rejoué actuellement (null = pas de signal). */
  snapshot: Snapshot | null;
  replayTime: number;
  /** Zoom automatique en cours (0 = plan large, 1 = zoom complet). */
  ptz: number;
  ptzTarget: Vector3;
  alarm: boolean;
  /** Date incrustée (« 31/10 » sauf pour l'épilogue). */
  date: string;
}

/**
 * Règle 2 : les écrans du poste de sécurité montrent le magasin d'il y a 2 à 4 minutes.
 *
 * Chaque caméra a sa RenderTargetTexture. Juste avant de la rendre, on remet le magasin
 * dans l'état de l'instantané (rayons, client, néons, Farid), puis on restaure l'état réel.
 * Les flux ne sont rendus que quand le joueur est au poste, une caméra par frame.
 */
export class SecurityCameras {
  private readonly feeds: Feed[] = [];
  private readonly farid: Figure;
  /** Le vigile qui tape le code de la boucherie sur la CAM 4 (il n'était pas là en direct). */
  private readonly ghost: Figure;
  private readonly registerLcd: LcdDisplay;
  private readonly registerDisplays: Mesh[];
  private liveDisplayMaterial: Material | null = null;
  private readonly epilogueFeed: Feed;
  /** Fin cachée : la vue plein écran de la CAM 0 (null si inactive). */
  private epilogue: { snapshot: Snapshot } | null = null;
  /** Appelé quand une caméra détecte un « mouvement » (événement injecté qui commence). */
  onAlarm: ((camera: number) => void) | null = null;
  private liveActors: { x: number; z: number; yaw: number; y: number; enabled: boolean }[] = [];
  private frame = 0;
  private readonly zoomPlane: Mesh;
  private readonly excluded = new Set<AbstractMesh>();
  private roundRobin = 0;
  private time = 0;
  private liveShopper = { x: 0, z: 0, yaw: 0, enabled: false };
  zoomed: number | null = null;
  zoomedAt = 0;
  /** Événements injectés que le joueur a vus (id). */
  readonly witnessed = new Set<string>();

  constructor(
    scene: Scene,
    private readonly world: World,
    private readonly neons: NeonSystem,
    private readonly shopper: ShopperModel,
    private readonly replay: ReplayBuffer,
    private readonly playerCamera: UniversalCamera,
    /** Personnages secondaires rejoués (Sabine, clients). */
    private readonly actors: Map<string, Figure>,
    private readonly events: readonly ReplayEvent[],
  ) {
    this.farid = buildFaridModel(scene);
    this.ghost = buildFaridModel(scene, "vigile-fantome");
    this.registerLcd = new LcdDisplay(scene, "afficheur-rejoue");
    this.registerDisplays = [...world.modules.values()].flatMap((m) => m.register?.displays ?? []);
    const bodyMat = mat(scene, "camera-boitier", "#d8d8d4", { specular: 0.3 });
    const ledMat = mat(scene, "camera-led", "#000000", { emissive: "#ff2020" });
    ledMat.disableLighting = true;
    const housings = new TransformNode("boitiers-cameras", scene);

    CAMERAS.forEach((def, k) => {
      const feed = this.createFeed(scene, def, k, (m) => !this.excluded.has(m));
      this.feeds.push(feed);

      const monitor = world.monitors[k < 3 ? 3 + k : k - 3];
      monitor.material = feed.material;
      // Un écran ne doit jamais être rendu dans une caméra : il affiche lui-même une caméra
      // (boucle de rétroaction WebGL : erreurs et travail GPU pour rien).
      for (const m of world.monitors) this.excluded.add(m);

      // Le boîtier de la caméra, avec sa petite LED rouge.
      const housing = MeshBuilder.CreateBox(`boitier-${k}`, { width: 0.16, height: 0.14, depth: 0.32 }, scene);
      housing.position.copyFrom(feed.camera.position);
      housing.lookAt(new Vector3(...def.target));
      housing.material = bodyMat;
      housing.parent = housings;
      const led = MeshBuilder.CreateSphere(`led-${k}`, { diameter: 0.025 }, scene);
      led.parent = housing;
      led.position.set(0.05, 0.05, 0.16);
      led.material = ledMat;
      // Rattachée au groupe (et plus au boîtier) en gardant sa place, pour pouvoir tout fusionner.
      housing.computeWorldMatrix(true);
      led.setParent(housings);
    });
    // Boîtiers et LED fusionnés (2 draw calls au lieu de 12), exclus du rendu des caméras.
    consolidate(housings);
    for (const m of housings.getChildMeshes()) this.excluded.add(m);

    // Vue plein écran d'une caméra (E sur un écran).
    this.zoomPlane = MeshBuilder.CreatePlane("cctv-zoom", { width: 1, height: 1 }, scene);
    this.zoomPlane.parent = playerCamera;
    this.zoomPlane.renderingGroupId = 1;
    this.zoomPlane.isPickable = false;
    this.zoomPlane.setEnabled(false);
    this.excluded.add(this.zoomPlane);

    // La CAM 0 filme les écrans du poste : pas de boucle de rétroaction, puisqu'aucun écran ne l'affiche.
    this.epilogueFeed = this.createFeed(scene, EPILOGUE_CAMERA, 6, (m) => !this.excluded.has(m) || world.monitors.includes(m as Mesh));
    this.epilogueFeed.date = "";
  }

  private createFeed(scene: Scene, def: CamDef, k: number, predicate: (m: AbstractMesh) => boolean): Feed {
    const c = CONFIG.cameras;
    const camera = new FreeCamera(`cctv-${k}`, new Vector3(...def.pos), scene);
    camera.setTarget(new Vector3(...def.target));
    camera.fov = 1.15;
    camera.minZ = 0.2;
    camera.maxZ = 90;
    camera.layerMask = 0x0fffffff | CCTV_ONLY_LAYER;
    camera.inputs.clear();

    const rtt = new RenderTargetTexture(`flux-${k}`, { width: c.feedWidth, height: c.feedHeight }, scene, { generateMipMaps: false });
    rtt.activeCamera = camera;
    rtt.clearColor = new Color4(0.02, 0.02, 0.025, 1);
    rtt.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
    rtt.renderListPredicate = predicate;
    rtt.forceLayerMaskCheck = true;
    scene.customRenderTargets.push(rtt);

    const overlay = new DynamicTexture(`incrust-${k}`, { width: 512, height: 333 }, scene, false);
    overlay.hasAlpha = true;

    const material = new ShaderMaterial(`cctv-${k}`, scene, { vertex: "cctv", fragment: "cctv" }, {
      attributes: ["position", "uv"],
      uniforms: ["worldViewProjection", "time", "signal"],
      samplers: ["feed", "overlay"],
    });
    material.setTexture("feed", rtt);
    material.setTexture("overlay", overlay);
    material.setFloat("time", 0);
    material.setFloat("signal", 0);

    const feed: Feed = { def, camera, rtt, material, overlay, overlayKey: "", snapshot: null, replayTime: 0, ptz: 0, ptzTarget: new Vector3(), alarm: false, date: "31/10" };
    rtt.onBeforeRenderObservable.add(() => this.applySnapshot(feed));
    rtt.onAfterRenderObservable.add(() => this.restoreLive());
    return feed;
  }

  get monitorMeshes(): Mesh[] {
    return this.feeds.map((_, k) => this.world.monitors[k < 3 ? 3 + k : k - 3]);
  }

  delayNow(minutes: number): number {
    return cameraDelay(minutes);
  }

  zoom(k: number): void {
    this.zoomed = ((k % this.feeds.length) + this.feeds.length) % this.feeds.length;
    this.zoomedAt = performance.now();
    this.showPlane(this.feeds[this.zoomed], 0.86);
  }

  private showPlane(feed: Feed, fill: number): void {
    const d = 0.35;
    const h = 2 * d * Math.tan(this.playerCamera.fov / 2) * fill;
    const w = (h * CONFIG.cameras.feedWidth) / CONFIG.cameras.feedHeight;
    this.zoomPlane.scaling.set(w, h, 1);
    this.zoomPlane.position.set(0, 0, d);
    this.zoomPlane.material = feed.material;
    this.zoomPlane.setEnabled(true);
  }

  /**
   * Fin cachée, dernière image : la CAM 0 montre, en différé, Farid lui-même en train de
   * regarder les écrans du poste. `date` : la date incrustée (celle de son embauche).
   */
  showEpilogue(date: string, minutes: number, assignment: readonly number[]): void {
    this.unzoom();
    this.epilogueFeed.date = date;
    this.epilogue = {
      snapshot: {
        t: minutes,
        assignment: [...assignment],
        player: { x: 1.5, z: 3.1, yaw: -Math.PI / 2 },
        shopper: null,
        neons: new Uint8Array(0),
        actors: [],
      },
    };
    this.showPlane(this.epilogueFeed, 1.02);
  }

  hideEpilogue(): void {
    this.epilogue = null;
    this.zoomPlane.setEnabled(false);
  }

  unzoom(): void {
    this.zoomed = null;
    if (!this.epilogue) this.zoomPlane.setEnabled(false);
  }

  /** Pendant le chargement, on affiche tout pour compiler les shaders (pas d'à-coup plus tard). */
  prewarm(on: boolean): void {
    this.farid.setEnabled(on);
    this.ghost.setEnabled(on);
  }

  reset(): void {
    this.unzoom();
    this.witnessed.clear();
  }

  /**
   * @param watching le joueur est au poste de sécurité (on rend les flux)
   * @returns les événements injectés vus pour la première fois cette frame
   */
  update(dt: number, minutes: number, watching: boolean, eye: Vector3, forward: Vector3): string[] {
    this.time += dt;
    const seen: string[] = [];
    if (this.epilogue) {
      const feed = this.epilogueFeed;
      feed.material.setFloat("time", this.time);
      feed.material.setFloat("signal", 1);
      feed.snapshot = this.epilogue.snapshot;
      this.drawOverlay(feed, this.epilogue.snapshot.t);
      feed.rtt.resetRefreshCounter();
      return seen;
    }
    const render = watching || this.zoomed !== null;
    this.feeds.forEach((feed, k) => {
      feed.material.setFloat("time", this.time);
      const t = minutes - cameraDelay(minutes);
      feed.replayTime = t;
      let snap = this.replay.at(t);
      const event = snap ? activeEvent(this.events, k, t) : null;
      if (snap && event) snap = event.apply(snap);
      feed.snapshot = snap;
      feed.material.setFloat("signal", snap ? 1 : 0);

      // Détection de mouvement : l'incrustation clignote, et le poste bipe.
      const alarm = !!snap?.alarm;
      if (alarm && !feed.alarm) this.onAlarm?.(k);
      feed.alarm = alarm;
      this.updatePtz(feed, snap, dt);
      this.drawOverlay(feed, snap ? t : null);

      if (event && !this.witnessed.has(event.id) && this.isWatched(k, eye, forward)) {
        this.witnessed.add(event.id);
        seen.push(event.id);
      }
    });
    if (render) {
      // Une caméra toutes les deux frames à tour de rôle (≈ 5 images/s par écran à 60 fps,
      // c'est de la vidéosurveillance), plus la caméra zoomée à chaque frame.
      this.frame++;
      const targets = new Set<number>();
      if (this.frame % 2 === 0) {
        this.roundRobin = (this.roundRobin + 1) % this.feeds.length;
        targets.add(this.roundRobin);
      }
      if (this.zoomed !== null) targets.add(this.zoomed);
      // Une caméra qui zoome toute seule est rendue plus souvent : le zoom doit rester fluide.
      this.feeds.forEach((f, k) => {
        if (f.ptz > 0.001 && f.ptz < 0.999) targets.add(k);
      });
      for (const k of targets) if (this.feeds[k].snapshot) this.feeds[k].rtt.resetRefreshCounter();
    }
    return seen;
  }

  /** Zoom automatique d'une caméra (PTZ) sur ce que montre l'événement injecté. */
  private updatePtz(feed: Feed, snap: Snapshot | null, dt: number): void {
    const want = snap?.ptz ? 1 : 0;
    if (snap?.ptz) feed.ptzTarget.set(snap.ptz.x, snap.ptz.y, snap.ptz.z);
    if (want === 0 && feed.ptz === 0) return;
    feed.ptz = want > feed.ptz ? Math.min(1, feed.ptz + dt / 1.8) : Math.max(0, feed.ptz - dt / 1.2);
    const k = feed.ptz * feed.ptz * (3 - 2 * feed.ptz);
    // Interpolation logarithmique du champ : le zoom paraît régulier, comme un vrai objectif.
    const fovZoom = snap?.ptz?.fov ?? 0.055;
    feed.camera.fov = Math.exp(Math.log(1.15) * (1 - k) + Math.log(fovZoom) * k);
    const base = new Vector3(...feed.def.target);
    feed.camera.setTarget(Vector3.Lerp(base, feed.ptzTarget, Math.min(1, k * 1.6)));
  }

  /** Le joueur regarde-t-il cet écran (zoom, ou devant le bureau face à l'écran) ? */
  private isWatched(k: number, eye: Vector3, forward: Vector3): boolean {
    if (this.zoomed === k) return true;
    const monitor = this.world.monitors[k < 3 ? 3 + k : k - 3];
    const to = monitor.getAbsolutePosition().subtract(eye);
    const dist = to.length();
    if (dist > CONFIG.cameras.watchDistance) return false;
    return Vector3.Dot(to.normalize(), forward) > Math.cos((25 * Math.PI) / 180);
  }

  private drawOverlay(feed: Feed, t: number | null): void {
    const key = t === null ? "nosignal" : GameClock.format(t);
    const blink = Math.floor(this.time * 1.5) % 2;
    const zoom = feed.ptz > 0.05 ? Math.round(1.15 / feed.camera.fov) : 1;
    const fullKey = `${key}|${blink}|${feed.alarm}|${zoom}|${feed.date}`;
    if (fullKey === feed.overlayKey) return;
    feed.overlayKey = fullKey;
    const ctx = feed.overlay.getContext() as unknown as CanvasRenderingContext2D;
    const w = 512;
    const h = 333;
    ctx.clearRect(0, 0, w, h);
    ctx.font = "bold 22px Courier New, monospace";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(230,240,230,0.92)";
    ctx.fillText(`${feed.def.name}  ${feed.def.label}`, 16, 14);
    if (t === null) {
      ctx.font = "bold 34px Courier New, monospace";
      ctx.textAlign = "center";
      ctx.fillText("PAS DE SIGNAL", w / 2, h / 2 - 18);
      ctx.textAlign = "left";
    } else {
      ctx.textAlign = "right";
      ctx.fillText(`${feed.date}  ${key}`.trim(), w - 16, h - 38);
      ctx.textAlign = "left";
      if (zoom > 1) ctx.fillText(`ZOOM x${zoom}`, 16, h - 38);
      if (feed.alarm && blink) {
        ctx.fillStyle = "rgba(255,210,60,0.95)";
        ctx.fillText("▲ MOUVEMENT", 16, 44);
      }
      if (blink) {
        ctx.fillStyle = "rgba(255,40,40,0.95)";
        ctx.beginPath();
        ctx.arc(w - 88, 26, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillText("REC", w - 74, 14);
      }
    }
    feed.overlay.update(true);
  }

  /** Remet le magasin dans l'état de l'instantané, le temps de rendre une caméra. */
  private applySnapshot(feed: Feed): void {
    const s = feed.snapshot;
    if (!s) return;
    this.world.placeModules(s.assignment);
    this.refreshModules();

    const live = this.shopper;
    this.liveShopper = { x: live.root.position.x, z: live.root.position.z, yaw: live.root.rotation.y, enabled: live.enabled };
    if (s.shopper) {
      live.setEnabled(true);
      live.root.position.set(s.shopper.x, 0, s.shopper.z);
      live.root.rotation.y = s.shopper.yaw;
      live.setLookUp(!!s.shopper.lookAtLens);
    } else live.setEnabled(false);
    live.refreshMatrices();

    this.farid.setEnabled(true);
    this.farid.update(0, s.player.x, s.player.z, s.player.yaw, 0);
    this.farid.refreshMatrices();

    if (s.ghost) {
      this.ghost.setEnabled(true);
      this.ghost.update(0, s.ghost.x, s.ghost.z, s.ghost.yaw, 0);
      this.ghost.refreshMatrices();
    }
    if (s.register !== undefined) {
      this.registerLcd.set(s.register);
      this.liveDisplayMaterial = this.registerDisplays[0]?.material ?? null;
      for (const d of this.registerDisplays) d.material = this.registerLcd.material;
    }

    this.liveActors = [];
    for (const [id, fig] of this.actors) {
      const r = fig.root;
      this.liveActors.push({ x: r.position.x, z: r.position.z, y: r.position.y, yaw: r.rotation.y, enabled: fig.enabled });
      const a = s.actors.find((x) => x.id === id);
      fig.setEnabled(!!a?.on);
      if (a?.on) {
        r.position.set(a.x, a.sitting ? -0.38 : 0, a.z);
        r.rotation.y = a.yaw;
      }
      fig.refreshMatrices();
    }

    if (s.neons.length > 0) this.neons.applyStates(s.neons);
  }

  private restoreLive(): void {
    this.world.placeModules();
    this.refreshModules();
    const live = this.shopper;
    live.root.position.set(this.liveShopper.x, 0, this.liveShopper.z);
    live.root.rotation.y = this.liveShopper.yaw;
    live.setLookUp(false);
    live.setEnabled(this.liveShopper.enabled);
    live.refreshMatrices();
    this.farid.setEnabled(false);
    this.ghost.setEnabled(false);
    if (this.liveDisplayMaterial) {
      for (const d of this.registerDisplays) d.material = this.liveDisplayMaterial;
      this.liveDisplayMaterial = null;
    }
    let i = 0;
    for (const fig of this.actors.values()) {
      const l = this.liveActors[i++];
      if (!l) break;
      fig.root.position.set(l.x, l.y, l.z);
      fig.root.rotation.y = l.yaw;
      fig.setEnabled(l.enabled);
      fig.refreshMatrices();
    }
    this.neons.restoreStates();
  }

  private refreshModules(): void {
    for (const inst of this.world.modules.values()) {
      inst.root.computeWorldMatrix(true);
      for (const n of inst.root.getDescendants(false)) (n as TransformNode).computeWorldMatrix?.(true);
    }
  }
}
