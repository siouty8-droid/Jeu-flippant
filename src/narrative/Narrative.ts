import type { AudioEngine } from "../audio/AudioEngine";
import { heavyStep, knock, squelch } from "../audio/Sounds";
import { CONFIG } from "../config";
import type { Rng } from "../core/Rng";
import type { NeonState } from "../systems/NeonSystem";
import type { NpcSystem } from "../systems/Npcs";
import type { ShopperState } from "../systems/ShopperBrain";
import type { LockLook } from "../systems/ColdLock";
import type { DoorSystem } from "../world/Doors";
import { D, LinePicker, type Line } from "./Dialogues";
import type { Talkie } from "./Talkie";

export interface NarrativeContext {
  minutes: number;
  player: { x: number; z: number };
  zoneId: string;
  loops: number;
  hasPhoto: boolean;
  shopperActive: boolean;
  shopperState: ShopperState;
  shopperDistance: number;
  shopperInSight: boolean;
  neonAbove: NeonState;
  /** La porte de la chambre froide est-elle visible par le joueur ? */
  coldDoorSeen: boolean;
  /** Étape 8 : où en est Farid dans les énigmes. */
  hasDouble?: boolean;
  registerExamined?: boolean;
  lockLook?: LockLook;
  lockFailures?: number;
}

/** Position de la porte de la chambre froide, côté réserve. */
const COLD_DOOR = { x: 14.3, z: 53.65 };
/** Les pas qui tournent en rond dans le local technique. */
const FOOTSTEPS_CENTER = { x: 3.5, z: 54 };
const S_WHISPER: Line = { speaker: "sabine", text: "(chuchote) …il s'est arrêté… recule… doucement…", via: "direct" };

/**
 * La nuit de Sabine : l'état de la chambre froide, sa température, et tout ce qui se dit au talkie.
 * Chaque événement de la timeline ne se déclenche qu'une fois par nuit.
 */
export class Narrative {
  /** Température de Sabine, 100 → 0. */
  temperature = 100;
  /** Enfermée derrière le verrou. */
  locked = false;
  /** Morte de froid : silence radio, et elle disparaît. */
  silent = false;
  /** La porte de la chambre froide a été ouverte (elle ne se refroidit plus). */
  freed = false;
  /** Farid la porte. */
  carried = false;
  private readonly fired = new Set<string>();
  private readonly picker: LinePicker;
  private chatterTimer = 0;
  private callCooldown = 0;
  private knockCooldown = 0;
  private whisperCooldown = 0;
  private innerCooldown = 0;
  private footstepTimer = 0;
  private footstepAngle = 0;
  private lastMinutes = 0;
  private greeted = false;
  private emergencyLoops = 0;
  private carryTimer = 0;

  constructor(
    private readonly audio: AudioEngine,
    private readonly talkie: Talkie,
    private readonly npcs: NpcSystem,
    private readonly doors: DoorSystem,
    private readonly rng: Rng,
  ) {
    this.picker = new LinePicker(rng);
  }

  /** Faiblesse de Sabine (0 = en forme, 1 = à bout), pour sa voix. */
  get weakness(): number {
    return this.locked || this.freed ? 1 - this.temperature / 100 : 0;
  }

  /** On peut la porter : porte ouverte, elle est là. */
  get canPickUp(): boolean {
    return this.freed && !this.carried && !this.silent;
  }

  reset(loops: number): void {
    this.temperature = 100;
    this.locked = false;
    this.silent = false;
    this.freed = false;
    this.carried = false;
    this.carryTimer = 0;
    this.fired.clear();
    this.picker.reset();
    this.chatterTimer = 25;
    this.callCooldown = 0;
    this.knockCooldown = 0;
    this.whisperCooldown = 0;
    this.footstepTimer = 0;
    this.lastMinutes = 0;
    this.greeted = false;
    this.talkie.clear();
    this.npcs.reset();
    this.npcs.sabine.sitting = true;
    this.npcs.lamp.setEnabled(false);
    this.talkie.say(loops > 0 ? D.introLoop : D.introFirst, { delay: 2.5 });
  }

  update(dt: number, ctx: NarrativeContext): void {
    const m = ctx.minutes;
    const dMinutes = Math.max(0, m - this.lastMinutes);
    this.lastMinutes = m;
    this.callCooldown -= dt;
    this.knockCooldown -= dt;
    this.whisperCooldown -= dt;
    this.innerCooldown -= dt;
    this.npcs.update(dt, m);
    const sabine = this.npcs.sabine;
    const nearSabine = !this.locked && Math.hypot(ctx.player.x - sabine.x, ctx.player.z - sabine.z) < 3.8;

    // Début de nuit : Sabine à sa caisse.
    if (!this.greeted && nearSabine && m < CONFIG.sabine.leavesAtMinutes) {
      this.greeted = true;
      this.talkie.say(ctx.loops > 0 ? D.greetingLoop : [this.pick("greeting", D.greetingFirst)]);
    }
    if (m < CONFIG.sabine.leavesAtMinutes) {
      this.chatterTimer -= dt;
      if (this.chatterTimer <= 0 && !this.talkie.busy) {
        this.chatterTimer = this.rng.range(45, 80);
        this.talkie.say(nearSabine ? this.pick("banter", D.nearBanter) : this.pick("early", D.earlyRadio));
      }
    }

    // 01:05 : elle part vérifier le stock en chambre froide.
    if (m >= CONFIG.sabine.leavesAtMinutes && this.once("leave")) {
      this.talkie.say(nearSabine ? D.leavingDirect : D.leaving, { interrupt: true });
      this.npcs.sendSabineToColdRoom(
        () => this.doors.setOpen(this.doors.get("reserve"), true),
        () => {
          const door = this.doors.get("froide");
          door.locked = false;
          this.doors.setOpen(door, true);
        },
      );
    }

    // 01:10 : la porte claque dès que personne ne la regarde. Un verrou apparaît.
    if (!this.locked && !this.freed && m >= CONFIG.sabine.lockedAtMinutes && sabine.arrived && this.fired.has("leave")) {
      const playerInside = ctx.zoneId === "froide";
      if (!ctx.coldDoorSeen && !playerInside) this.lock();
    }

    if (this.carried) this.updateCarried(dt, dMinutes, ctx);
    else if (this.locked) this.updateLocked(dt, dMinutes, ctx);
  }

  /** Farid la porte : elle se réchauffe un peu, et elle lui parle à l'oreille. */
  private updateCarried(dt: number, dMinutes: number, ctx: NarrativeContext): void {
    this.temperature = Math.min(100, this.temperature + (CONFIG.carry.warmingPerHour * dMinutes) / 60);
    // Sa voix vient de l'épaule de Farid.
    this.npcs.sabine.x = ctx.player.x;
    this.npcs.sabine.z = ctx.player.z;
    if (ctx.shopperActive && ctx.shopperState === "stopped" && ctx.shopperDistance < 15 && this.whisperCooldown <= 0) {
      this.whisperCooldown = 80;
      this.talkie.say(S_WHISPER, { interrupt: true });
    }
    this.carryTimer -= dt;
    if (this.carryTimer <= 0 && !this.talkie.busy) {
      this.carryTimer = this.rng.range(30, 55);
      this.talkie.say(this.pick("carrying", D.carrying));
    }
  }

  /** La serrure a cédé : la porte s'ouvre sur Sabine… ou sur une pièce vide. */
  onColdRoomOpened(): void {
    this.locked = false;
    this.freed = true;
    if (this.silent) {
      this.talkie.say(D.innerColdRoomEmpty, { interrupt: true, delay: 1.2 });
      return;
    }
    this.talkie.say(D.lockOpened, { interrupt: true, delay: 1.0 });
  }

  /** Farid prend Sabine sur son dos. */
  pickUp(): void {
    this.carried = true;
    this.npcs.sabine.figure.setEnabled(false);
    this.carryTimer = 35;
    this.talkie.say(D.pickedUp, { interrupt: true, delay: 0.5 });
  }

  onRegisterExamined(): void {
    if (this.innerCooldown > 0) return;
    this.innerCooldown = 4;
    this.talkie.say(D.innerRegisterLocked);
  }

  onRegisterOpened(): void {
    this.talkie.say(D.innerRegisterOpened, { interrupt: true, delay: 0.8 });
  }

  onBadgesFound(): void {
    this.talkie.say(D.innerBadges, { interrupt: true });
  }

  /** La clé du trousseau est rentrée sans tourner. */
  onLockFailed(failures: number): void {
    if (this.silent || !this.locked) return;
    if (failures === 1) {
      knock(this.audio, { x: 13.6, y: 1.2, z: COLD_DOOR.z }, 3);
      this.knockCooldown = 55;
      this.talkie.say(D.lockFailedFirst, { interrupt: true, delay: 1.2 });
    }
  }

  private lock(): void {
    this.locked = true;
    this.npcs.sabine.sitting = true;
    this.doors.slamAndBolt(this.doors.get("froide"));
    this.talkie.say(D.panic, { interrupt: true, delay: 1.6 });
    this.chatterTimer = 60;
  }

  private updateLocked(dt: number, dMinutes: number, ctx: NarrativeContext): void {
    const c = CONFIG.sabine;
    const m = ctx.minutes;
    if (!this.silent) {
      const rate = m >= c.lateFromMinutes ? c.coolingPerHourLate : c.coolingPerHour;
      this.temperature = Math.max(0, this.temperature - (rate * dMinutes) / 60);
      if (this.temperature <= 0) {
        // Silence radio. Derrière la porte, il n'y a plus que sa lampe.
        this.silent = true;
        this.talkie.clear();
        squelch(this.audio);
        this.npcs.sabine.figure.setEnabled(false);
        this.npcs.lamp.setEnabled(true);
        return;
      }
    } else return;

    // Événements de la timeline.
    if (m >= 76 && this.once("rule1")) this.talkie.say(D.rule1Hint);
    if (ctx.shopperActive && ctx.shopperInSight && this.once("shopper-seen")) this.talkie.say(D.shopperFirstSeen, { delay: 1.2 });
    if (m >= 150 && this.once("footsteps")) this.talkie.say(D.footsteps);
    if (m >= 240 && this.once("late")) this.talkie.say(D.late);
    if (this.temperature < 12 && this.once("very-late")) this.talkie.say(D.veryLate);

    // Il s'est arrêté pas loin : elle chuchote.
    if (ctx.shopperActive && ctx.shopperState === "stopped" && ctx.shopperDistance < 15 && this.whisperCooldown <= 0) {
      this.whisperCooldown = 80;
      this.talkie.say(this.pick("stopped", D.shopperStopped), { interrupt: true });
    }

    // Le joueur est juste derrière la porte : elle frappe.
    const atDoor = Math.hypot(ctx.player.x - COLD_DOOR.x, ctx.player.z - COLD_DOOR.z) < 2.6;
    if (atDoor && this.knockCooldown <= 0) {
      this.knockCooldown = 55;
      knock(this.audio, { x: 13.6, y: 1.2, z: COLD_DOOR.z }, 4);
      this.talkie.say(this.pick("knock", D.knockedFromInside), { delay: 1.1 });
    }

    // Les pas en rond dans le local technique, à partir de 02:30.
    // Quand Farid entre dans le local technique, il n'y a personne : les pas s'arrêtent.
    if (m >= 150 && this.audio.ready && ctx.zoneId !== "technique" && Math.hypot(ctx.player.x - FOOTSTEPS_CENTER.x, ctx.player.z - FOOTSTEPS_CENTER.z) < 30) {
      this.footstepTimer -= dt;
      if (this.footstepTimer <= 0) {
        this.footstepTimer = 0.62;
        this.footstepAngle += 0.42;
        heavyStep(this.audio, { x: FOOTSTEPS_CENTER.x + Math.cos(this.footstepAngle) * 1.7, y: 0.05, z: FOOTSTEPS_CENTER.z + Math.sin(this.footstepAngle) * 1.7 });
      }
    }

    // Messages spontanés.
    this.chatterTimer -= dt;
    if (this.chatterTimer <= 0 && !this.talkie.busy) {
      this.chatterTimer = this.rng.range(c.chatterMinSeconds, c.chatterMaxSeconds);
      const pool = m < 150 ? D.phase1 : m < 240 ? D.phase2 : D.phase3;
      this.talkie.say(this.pick(`phase-${pool.length}`, pool));
    }
  }

  /** Touche T : Farid appelle Sabine, qui répond selon la situation (c'est aussi le système d'indices). */
  call(ctx: NarrativeContext): void {
    if (this.callCooldown > 0 || this.talkie.busy) return;
    this.callCooldown = CONFIG.sabine.callCooldownSeconds;
    const sabine = this.npcs.sabine;
    const near = !this.locked && !this.freed && Math.hypot(ctx.player.x - sabine.x, ctx.player.z - sabine.z) < 4;
    if (near) {
      this.talkie.say(D.callBeforeNear);
      return;
    }
    this.talkie.say(this.pick("call", D.callFarid));
    if (this.silent) {
      setTimeout(() => squelch(this.audio), 1800);
      return;
    }
    this.talkie.say(this.callResponse(ctx), { delay: 0.9 });
  }

  private callResponse(ctx: NarrativeContext): Line {
    if (ctx.minutes < CONFIG.sabine.leavesAtMinutes) return D.callBefore[0];
    if (!this.locked && !this.freed) return D.callWalking[0];
    if (ctx.neonAbove === "orange" || (ctx.shopperState === "stopped" && ctx.shopperDistance < 12)) return D.callDanger[0];
    if (this.freed) return D.callCarrying[0];
    if (!ctx.hasPhoto) return D.callNoPhoto[0];
    const atDoor = Math.hypot(ctx.player.x - COLD_DOOR.x, ctx.player.z - COLD_DOOR.z) < 3.5;
    const look = ctx.lockLook ?? "verrou";
    if (atDoor && look !== "verrou") return (ctx.lockFailures ?? 0) > 0 ? D.callLockFailed[0] : D.callLockChanged[0];
    if (atDoor) return D.callAtDoor[0];
    if (!ctx.hasDouble && ctx.registerExamined) return this.pick("register", D.callRegister);
    if (!ctx.hasDouble && ctx.minutes >= 110 && this.once("find-double")) return D.callFindDouble[0];
    if (ctx.player.z < 45) return D.callFarAway[0];
    return this.pick("generic", D.callGeneric);
  }

  /** Farid essaie de sortir par l'entrée. */
  onEntranceBlocked(): void {
    if (this.innerCooldown > 0) return;
    this.innerCooldown = 8;
    this.talkie.say(this.locked || this.freed ? D.innerEntranceAfter : D.innerEntranceBefore);
  }

  /** Il vient de franchir une sortie de secours… et se retrouve ailleurs dans le magasin. */
  onEmergencyLoop(): void {
    this.emergencyLoops++;
    this.talkie.say(this.emergencyLoops === 1 ? D.innerEmergencyFirst : D.innerEmergencyAgain, { interrupt: true, delay: 0.6 });
  }

  onColdDoorBolted(): void {
    if (this.innerCooldown > 0) return;
    this.innerCooldown = 6;
    this.talkie.say(D.innerColdDoorLocked, { delay: 2.5 });
  }

  onRayon9(): void {
    if (this.locked && !this.silent && this.once("rayon9")) this.talkie.say(D.rayon9, { delay: 2 });
  }

  private once(id: string): boolean {
    if (this.fired.has(id)) return false;
    this.fired.add(id);
    return true;
  }

  private pick(key: string, pool: readonly Line[]): Line {
    return this.picker.pick(key, pool);
  }
}
