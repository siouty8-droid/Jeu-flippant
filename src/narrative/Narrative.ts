import type { AudioEngine } from "../audio/AudioEngine";
import { heavyStep, knock, squelch } from "../audio/Sounds";
import { CONFIG } from "../config";
import type { Rng } from "../core/Rng";
import type { NeonState } from "../systems/NeonSystem";
import type { NpcSystem } from "../systems/Npcs";
import type { ShopperState } from "../systems/ShopperBrain";
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
}

/** Position de la porte de la chambre froide, côté réserve. */
const COLD_DOOR = { x: 14.3, z: 53.65 };
/** Les pas qui tournent en rond dans le local technique. */
const FOOTSTEPS_CENTER = { x: 3.5, z: 54 };

/**
 * La nuit de Sabine : l'état de la chambre froide, sa température, et tout ce qui se dit au talkie.
 * Chaque événement de la timeline ne se déclenche qu'une fois par nuit.
 */
export class Narrative {
  /** Température de Sabine, 100 → 0. */
  temperature = 100;
  locked = false;
  silent = false;
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
    return this.locked ? 1 - this.temperature / 100 : 0;
  }

  reset(loops: number): void {
    this.temperature = 100;
    this.locked = false;
    this.silent = false;
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
    if (!this.locked && m >= CONFIG.sabine.lockedAtMinutes && sabine.arrived && this.fired.has("leave")) {
      const playerInside = ctx.zoneId === "froide";
      if (!ctx.coldDoorSeen && !playerInside) this.lock();
    }

    if (this.locked) this.updateLocked(dt, dMinutes, ctx);
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
        this.silent = true;
        this.talkie.clear();
        squelch(this.audio);
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
    if (m >= 150 && this.audio.ready && Math.hypot(ctx.player.x - FOOTSTEPS_CENTER.x, ctx.player.z - FOOTSTEPS_CENTER.z) < 30) {
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
    const near = !this.locked && Math.hypot(ctx.player.x - sabine.x, ctx.player.z - sabine.z) < 4;
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
    if (!this.locked) return D.callWalking[0];
    if (ctx.neonAbove === "orange" || (ctx.shopperState === "stopped" && ctx.shopperDistance < 12)) return D.callDanger[0];
    if (!ctx.hasPhoto) return D.callNoPhoto[0];
    if (Math.hypot(ctx.player.x - COLD_DOOR.x, ctx.player.z - COLD_DOOR.z) < 3.5) return D.callAtDoor[0];
    if (ctx.player.z < 45) return D.callFarAway[0];
    return this.pick("generic", D.callGeneric);
  }

  /** Farid essaie de sortir par l'entrée. */
  onEntranceBlocked(): void {
    if (this.innerCooldown > 0) return;
    this.innerCooldown = 8;
    this.talkie.say(this.locked ? D.innerEntranceAfter : D.innerEntranceBefore);
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
