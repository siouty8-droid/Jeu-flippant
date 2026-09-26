import type { Scene } from "../babylon";
import type { AudioEngine } from "../audio/AudioEngine";
import { CartRattle, canClink, footstep } from "../audio/Sounds";
import type { Rng } from "../core/Rng";
import type { Materials } from "../world/Materials";
import type { NavGraph } from "../world/NavGraph";
import type { OcclusionMap, Vec3 } from "../world/Occlusion";
import { ShopperModel } from "../world/ShopperModel";
import { ShopperBrain, type ShopperState } from "./ShopperBrain";

/** Relie le cerveau du client (logique) à son corps (3D) et à ses sons. */
export class ShopperAI {
  readonly brain: ShopperBrain;
  readonly model: ShopperModel;
  private rattle: CartRattle | null = null;
  private seenPickups = 0;
  private stepDistance = 0;
  private lastX = 0;
  private lastZ = 0;
  /** Ligne de vue joueur ↔ client à la dernière frame. */
  lineOfSight = false;

  constructor(
    scene: Scene,
    mats: Materials,
    graph: NavGraph,
    rng: Rng,
    private readonly audio: AudioEngine,
    private readonly occ: OcclusionMap,
  ) {
    this.brain = new ShopperBrain(graph, rng.fork("cerveau"));
    this.model = new ShopperModel(scene, mats, rng.fork("modele"));
  }

  get state(): ShopperState {
    return this.brain.state;
  }

  get position(): { x: number; z: number } {
    return { x: this.brain.x, z: this.brain.z };
  }

  activate(player: { x: number; z: number }, firstSlot: number | null): void {
    this.brain.activate(player, firstSlot);
    this.lastX = this.brain.x;
    this.lastZ = this.brain.z;
    this.model.setEnabled(true);
  }

  deactivate(): void {
    this.brain.deactivate();
    this.model.setEnabled(false);
  }

  update(dt: number, minutes: number, eye: Vec3, noiseRadius: number): void {
    const b = this.brain;
    if (!b.active) {
      this.rattle?.update(dt, { x: 0, y: -50, z: 0 }, 0);
      return;
    }
    const head = { x: b.x, y: 1.7, z: b.z };
    this.lineOfSight = !this.occ.blocked(eye, head);
    b.update(dt, {
      minutes,
      player: { x: eye.x, z: eye.z },
      noiseRadius,
      lineOfSight: this.lineOfSight,
      isClear: (ax, az, bx, bz) => !this.occ.blocked({ x: ax, y: 0.3, z: az }, { x: bx, y: 0.3, z: bz }),
    });
    this.model.update(dt, b.x, b.z, b.bodyYaw, b.speed);

    // Sons : roulettes, pas sur le carrelage, conserves posées dans le caddie.
    if (this.audio.ready) {
      this.rattle ??= new CartRattle(this.audio);
      const cart = { x: b.x + Math.sin(b.bodyYaw) * 1.0, y: 0.2, z: b.z + Math.cos(b.bodyYaw) * 1.0 };
      this.rattle.update(dt, cart, b.speed);
      this.stepDistance += Math.hypot(b.x - this.lastX, b.z - this.lastZ);
      const stepLength = b.state === "hunting" ? 1.0 : 0.7;
      if (this.stepDistance > stepLength) {
        this.stepDistance = 0;
        footstep(this.audio, { x: b.x, y: 0.05, z: b.z }, b.state === "hunting");
      }
      if (b.pickups !== this.seenPickups) {
        this.seenPickups = b.pickups;
        canClink(this.audio, { ...cart, y: 0.8 });
      }
    }
    this.lastX = b.x;
    this.lastZ = b.z;
  }

  /** Debug : met le client en arrêt à ~9 m devant le joueur, dans le même axe. */
  debugStopAhead(x: number, z: number, yaw: number): void {
    if (!this.brain.active) this.activate({ x, z }, null);
    this.brain.x = x + Math.sin(yaw) * 9;
    this.brain.z = z + Math.cos(yaw) * 9;
    this.brain.forceStop(20);
  }
}
