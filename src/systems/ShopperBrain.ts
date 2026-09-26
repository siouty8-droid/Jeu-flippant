import { CONFIG } from "../config";
import type { Rng } from "../core/Rng";
import type { NavGraph, NavNode } from "../world/NavGraph";

/**
 * Règle 4 : l'autre client. Logique pure (pas de 3D), testée dans tests/shopper.test.ts.
 *
 * - SHOPPING : pousse son caddie de rayon en rayon. Dans les allées il avance au pas en
 *   prenant des produits, mais il ne s'arrête jamais complètement : tant qu'il roule, il est inoffensif.
 * - STOPPED  : le caddie s'immobilise. Si le joueur fait du bruit à portée (ou le touche), il passe en traque.
 * - HUNTING  : il fonce vers le dernier bruit entendu, de plus en plus vite. Il recule vers le joueur,
 *   dos tourné : on ne voit jamais son visage.
 * - CAUGHT   : il a rattrapé le joueur. Le jeu relance la nuit.
 */

export type ShopperState = "inactive" | "shopping" | "stopped" | "hunting" | "caught";

export interface ShopperSenses {
  minutes: number;
  player: { x: number; z: number };
  /** Rayon du bruit fait par le joueur cette frame (0 = silence). */
  noiseRadius: number;
  /** Ligne de vue directe entre la tête du joueur et celle du client. */
  lineOfSight: boolean;
  /** Le sol est-il dégagé en ligne droite entre ces deux points ? */
  isClear: (ax: number, az: number, bx: number, bz: number) => boolean;
}

interface Point {
  x: number;
  z: number;
}

export class ShopperBrain {
  state: ShopperState = "inactive";
  x = 0;
  z = 0;
  /** Direction du déplacement (celle du caddie). */
  moveYaw = 0;
  /** Direction du corps : peut différer du déplacement quand il se détourne du joueur. */
  bodyYaw = 0;
  speed = 0;
  /** Incrémenté à chaque produit pris dans un rayon (pour le son). */
  pickups = 0;

  private route: Point[] = [];
  private stopTimer = 0;
  private huntElapsed = 0;
  private sinceHeard = 0;
  private repathTimer = 0;
  private rerouteCooldown = 0;
  private pickupTimer = 3;
  private encounter = false;
  private lastHeard: Point = { x: 0, z: 0 };
  private firstTargetSlot: number | null = null;
  private isClear: ShopperSenses["isClear"] = () => true;
  /** Destination du chemin en cours pendant la traque (pour ne pas recalculer pour rien). */
  private routeGoal: Point | null = null;

  constructor(
    private readonly graph: NavGraph,
    private readonly rng: Rng,
  ) {}

  get active(): boolean {
    return this.state !== "inactive";
  }

  /** Apparition loin du joueur. `firstSlot` : premier rayon visité (le joueur doit le croiser là). */
  activate(player: Point, firstSlot: number | null = null): void {
    const aisles = this.graph.nodes.filter((n) => n.slot !== undefined && this.graph.walkable(n.id));
    const spawn = aisles.reduce((a, b) => (dist(b, player) > dist(a, player) ? b : a));
    this.x = spawn.x;
    this.z = spawn.z;
    this.bodyYaw = this.moveYaw = Math.atan2(spawn.x - player.x, spawn.z - player.z);
    this.state = "shopping";
    this.route = [];
    this.encounter = false;
    this.firstTargetSlot = firstSlot;
  }

  deactivate(): void {
    this.state = "inactive";
    this.route = [];
    this.speed = 0;
  }

  /** Debug : arrêt immédiat. */
  forceStop(seconds = 15): void {
    if (!this.active) return;
    this.state = "stopped";
    this.stopTimer = seconds;
    this.route = [];
    this.speed = 0;
  }

  update(dt: number, s: ShopperSenses): void {
    if (this.state === "inactive" || this.state === "caught") return;
    const c = CONFIG.shopper;
    const d = dist(this, s.player);
    this.isClear = s.isClear;
    this.rerouteCooldown -= dt;

    this.updateEncounter(d, s);

    switch (this.state) {
      case "shopping":
        this.shop(dt, d, s);
        break;
      case "stopped":
        this.speed = 0;
        this.stopTimer -= dt;
        if (s.noiseRadius >= d || d < 1.6) this.startHunt(s.player);
        else if (this.stopTimer <= 0) {
          this.state = "shopping";
          this.chooseTarget(s.player, true);
        }
        break;
      case "hunting":
        this.hunt(dt, d, s);
        break;
    }

    if (this.state === "hunting" && dist(this, s.player) < c.catchDistance) {
      this.state = "caught";
      this.speed = 0;
    }
    this.updateBody(dt, s);
  }

  /** Une rencontre = le joueur passe à moins de encounterDistance. On tire un arrêt une fois par rencontre. */
  private updateEncounter(d: number, s: ShopperSenses): void {
    const c = CONFIG.shopper;
    if (!this.encounter && d < c.encounterDistance) {
      this.encounter = true;
      if (this.state === "shopping" && s.minutes >= c.stopsFromMinutes && this.rng.chance(stopChance(s.minutes))) {
        const night = Math.min(1, Math.max(0, (s.minutes - c.stopsFromMinutes) / 180));
        this.state = "stopped";
        this.stopTimer = c.stopSecondsMin + (c.stopSecondsMax - c.stopSecondsMin) * (0.3 * this.rng.next() + 0.7 * night);
        this.speed = 0;
      }
    } else if (this.encounter && d > c.encounterDistance + 6) {
      this.encounter = false;
    }
  }

  private shop(dt: number, d: number, s: ShopperSenses): void {
    const c = CONFIG.shopper;
    if (this.route.length === 0) this.chooseTarget(s.player, false);

    // Il ne marche jamais droit vers le joueur : s'il le voit devant lui, il change de rayon.
    if (s.lineOfSight && d < 18 && this.rerouteCooldown <= 0 && this.route.length > 0) {
      const toPlayer = Math.atan2(s.player.x - this.x, s.player.z - this.z);
      if (Math.abs(angleDiff(this.moveYaw, toPlayer)) < Math.PI / 3) {
        this.chooseTarget(s.player, true);
        this.rerouteCooldown = 3;
      }
    }

    const inAisle = this.graph.nodes.some((n) => n.slot !== undefined && Math.abs(n.x - this.x) < 0.5 && Math.abs(n.z - this.z) < 4.5);
    this.speed = inAisle ? c.aisleSpeed : c.corridorSpeed;
    if (inAisle) {
      this.pickupTimer -= dt;
      if (this.pickupTimer <= 0) {
        this.pickups++;
        this.pickupTimer = this.rng.range(2.5, 6);
      }
    }
    this.advance(dt);
  }

  private startHunt(from: Point): void {
    this.state = "hunting";
    this.routeGoal = null;
    this.huntElapsed = 0;
    this.sinceHeard = 0;
    this.lastHeard = { ...from };
    this.route = [];
    this.repathTimer = 0;
  }

  private hunt(dt: number, d: number, s: ShopperSenses): void {
    const c = CONFIG.shopper;
    this.huntElapsed += dt;
    this.sinceHeard += dt;
    this.repathTimer -= dt;
    this.speed = c.huntSpeedStart + (c.huntSpeedMax - c.huntSpeedStart) * Math.min(1, this.huntElapsed / c.huntAcceleration);

    if (s.noiseRadius >= d || (s.lineOfSight && d < 10)) {
      this.lastHeard = { ...s.player };
      this.sinceHeard = 0;
    }

    if (this.repathTimer <= 0) {
      this.repathTimer = 0.4;
      if (d < 12 && this.sinceHeard === 0 && s.isClear(this.x, this.z, s.player.x, s.player.z)) {
        this.route = [{ ...s.player }];
        this.routeGoal = null;
      } else if (!this.routeGoal || dist(this.routeGoal, this.lastHeard) > 1 || this.route.length === 0) {
        this.route = this.routeTo(this.lastHeard);
        this.routeGoal = { ...this.lastHeard };
      }
    }

    this.advance(dt);
    if (this.sinceHeard > c.huntGiveUpSeconds && this.route.length === 0) {
      this.state = "shopping";
      this.chooseTarget(s.player, true);
    }
  }

  private advance(dt: number): void {
    let step = this.speed * dt;
    while (step > 0 && this.route.length > 0) {
      const target = this.route[0];
      const dx = target.x - this.x;
      const dz = target.z - this.z;
      const len = Math.hypot(dx, dz);
      if (len < 1e-3) {
        this.route.shift();
        continue;
      }
      this.moveYaw = Math.atan2(dx, dz);
      if (len <= step) {
        this.x = target.x;
        this.z = target.z;
        this.route.shift();
        step -= len;
      } else {
        this.x += (dx / len) * step;
        this.z += (dz / len) * step;
        step = 0;
      }
    }
  }

  /** Prochain rayon à visiter. `awayFrom` : on choisit un rayon qui l'éloigne du joueur. */
  private chooseTarget(player: Point, awayFrom: boolean): void {
    let candidates = this.graph.nodes.filter((n) => n.slot !== undefined && this.graph.walkable(n.id) && dist(n, this) > 3);
    if (this.firstTargetSlot !== null) {
      const first = candidates.find((n) => n.slot === this.firstTargetSlot);
      this.firstTargetSlot = null;
      if (first) {
        this.route = this.routeTo(first);
        return;
      }
    }
    if (awayFrom) {
      const away = candidates.filter((n) => (n.x - this.x) * (player.x - this.x) + (n.z - this.z) * (player.z - this.z) < 0);
      if (away.length > 0) candidates = away;
    }
    // Il évite le rayon où se trouve le joueur.
    const notNearPlayer = candidates.filter((n) => dist(n, player) > 5);
    if (notNearPlayer.length > 0) candidates = notNearPlayer;
    if (candidates.length === 0) return;
    this.route = this.routeTo(this.rng.pick(candidates));
  }

  private routeTo(target: Point | NavNode): Point[] {
    // Premier nœud : le plus proche qu'on peut rejoindre sans traverser une gondole.
    const start = this.graph.nearest(this.x, this.z, (n) => this.isClear(this.x, this.z, n.x, n.z));
    const end = this.graph.nearest(target.x, target.z);
    const nodes = this.graph.path(start.id, end.id);
    const pts: Point[] = nodes.map((id) => ({ x: this.graph.nodes[id].x, z: this.graph.nodes[id].z }));
    // Point final hors du graphe (le joueur) : seulement s'il est accessible en ligne droite
    // depuis le dernier nœud. Sinon il s'arrête au nœud : il ne traverse ni mur ni porte fermée.
    const last = pts[pts.length - 1];
    if (!("id" in target) && (!last || this.isClear(last.x, last.z, target.x, target.z))) pts.push({ x: target.x, z: target.z });
    // Pas de retour en arrière : si l'étape suivante est accessible en ligne droite, on saute la première.
    while (pts.length >= 2 && this.isClear(this.x, this.z, pts[1].x, pts[1].z)) pts.shift();
    return pts;
  }

  /** Le corps suit le caddie, sauf quand le joueur risque de voir son visage. */
  private updateBody(dt: number, s: ShopperSenses): void {
    const away = Math.atan2(this.x - s.player.x, this.z - s.player.z);
    const facing = Math.abs(angleDiff(this.bodyYaw, away + Math.PI));
    let desired = this.moveYaw;
    if (this.state === "stopped" || this.state === "hunting" || this.state === "caught") desired = away;
    else if (s.lineOfSight && facing < (CONFIG.shopper.faceAvoidDegrees * Math.PI) / 180) desired = away;

    // Si le joueur vient d'apparaître face à lui (coin d'allée), on le retourne d'un coup :
    // c'est la première frame où il est visible, le changement ne se voit pas.
    if (s.lineOfSight && facing < Math.PI / 2 + 0.2) {
      this.bodyYaw = away;
      return;
    }
    const diff = angleDiff(this.bodyYaw, desired);
    const maxTurn = CONFIG.shopper.turnRate * dt;
    this.bodyYaw = wrap(this.bodyYaw + Math.max(-maxTurn, Math.min(maxTurn, diff)));
  }
}

export function stopChance(minutes: number): number {
  const table = CONFIG.shopper.stopChance;
  if (minutes < CONFIG.shopper.stopsFromMinutes) return 0;
  if (minutes <= table[0][0]) return table[0][1];
  for (let i = 0; i + 1 < table.length; i++) {
    const [m0, p0] = table[i];
    const [m1, p1] = table[i + 1];
    if (minutes <= m1) return p0 + ((p1 - p0) * (minutes - m0)) / (m1 - m0);
  }
  return table[table.length - 1][1];
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function wrap(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Écart signé de a vers b, dans ]-π, π]. */
export function angleDiff(a: number, b: number): number {
  return wrap(b - a);
}
