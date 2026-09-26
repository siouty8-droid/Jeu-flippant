import { Mesh, MeshBuilder, Scene, UniversalCamera, Vector3 } from "@babylonjs/core";
import { CONFIG } from "../config";

/**
 * Déplacement à la première personne.
 *
 * La caméra ne gère que le regard (souris). Le déplacement passe par un corps
 * invisible (ellipsoïde) déplacé avec moveWithCollisions : ça nous laisse la main
 * sur la vitesse (marche, course, portage de Sabine plus tard) et sur le bruit.
 * ZQSD et WASD marchent en même temps, pas besoin de réglage clavier.
 */
export class PlayerController {
  readonly camera: UniversalCamera;
  private readonly body: Mesh;
  private readonly keys = new Set<string>();
  private bobPhase = 0;
  private enabled = false;
  /** Vitesse horizontale réelle de la dernière frame (m/s). */
  speed = 0;
  running = false;
  /** Multiplicateur appliqué à la vitesse (téléphone sorti). */
  speedFactor = 1;
  /** Farid porte Sabine : plus lent, et plus de course possible. */
  carrying = false;

  constructor(
    scene: Scene,
    canvas: HTMLCanvasElement,
    spawn: Vector3,
    spawnYaw: number,
  ) {
    const p = CONFIG.player;
    this.body = MeshBuilder.CreateSphere("corps-joueur", { diameter: 1 }, scene);
    this.body.isVisible = false;
    this.body.isPickable = false;
    this.body.checkCollisions = false;
    this.body.ellipsoid = new Vector3(p.radius, p.halfHeight, p.radius);
    this.body.ellipsoidOffset = Vector3.Zero();
    this.body.position.set(spawn.x, p.halfHeight + 0.05, spawn.z);

    this.camera = new UniversalCamera("oeil", new Vector3(spawn.x, p.eyeHeight, spawn.z), scene);
    this.camera.rotation.y = spawnYaw;
    this.camera.minZ = 0.05;
    this.camera.maxZ = 200;
    this.camera.fov = (p.fovDegrees * Math.PI) / 180;
    this.camera.inertia = 0;
    this.camera.inputs.clear();
    this.camera.inputs.addMouse();
    this.camera.angularSensibility = 2500 / p.mouseSensitivity;
    this.camera.attachControl(canvas, true);

    window.addEventListener("keydown", (e) => this.keys.add(e.code));
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.keys.clear());
  }

  get position(): Vector3 {
    return this.body.position;
  }

  get yaw(): number {
    return this.camera.rotation.y;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.keys.clear();
  }

  teleport(x: number, z: number, yaw?: number): void {
    this.body.position.set(x, CONFIG.player.halfHeight + 0.05, z);
    if (yaw !== undefined) this.camera.rotation.y = yaw;
  }

  update(dt: number): void {
    const p = CONFIG.player;
    const has = (...codes: string[]) => codes.some((c) => this.keys.has(c));
    let forward = 0;
    let strafe = 0;
    if (this.enabled) {
      // e.code est la position physique de la touche : KeyW = Z en AZERTY, KeyA = Q.
      if (has("KeyW", "ArrowUp")) forward += 1;
      if (has("KeyS", "ArrowDown")) forward -= 1;
      if (has("KeyD", "ArrowRight")) strafe += 1;
      if (has("KeyA", "ArrowLeft")) strafe -= 1;
    }
    const moving = forward !== 0 || strafe !== 0;
    this.running = moving && !this.carrying && has("ShiftLeft", "ShiftRight") && forward >= 0;
    const target = (this.running ? p.runSpeed : p.walkSpeed) * this.speedFactor * (this.carrying ? CONFIG.carry.speedFactor : 1);

    const yaw = this.camera.rotation.y;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    let dx = fx * forward + fz * strafe;
    let dz = fz * forward - fx * strafe;
    const len = Math.hypot(dx, dz);
    if (len > 0) {
      dx = (dx / len) * target * dt;
      dz = (dz / len) * target * dt;
    }

    const before = this.body.position.clone();
    if (moving) this.body.moveWithCollisions(new Vector3(dx, 0, dz));
    this.body.position.y = p.halfHeight + 0.05;
    const moved = Math.hypot(this.body.position.x - before.x, this.body.position.z - before.z);
    this.speed = dt > 0 ? moved / dt : 0;

    // Balancement de la tête, proportionnel à la vitesse réelle (on ne « marche » pas contre un mur).
    const bob = this.running ? p.headBob.runAmplitude : p.headBob.walkAmplitude;
    const freq = this.running ? p.headBob.runFrequency : p.headBob.walkFrequency;
    const intensity = Math.min(1, this.speed / p.walkSpeed);
    if (intensity > 0.05) this.bobPhase += dt * freq * Math.PI * 2;
    else this.bobPhase *= 0.9;
    const bobY = Math.sin(this.bobPhase) * bob * intensity;
    const bobX = Math.cos(this.bobPhase * 0.5) * bob * 0.5 * intensity;

    this.camera.position.set(
      this.body.position.x + Math.cos(yaw) * bobX,
      p.eyeHeight + bobY,
      this.body.position.z - Math.sin(yaw) * bobX,
    );
  }
}
