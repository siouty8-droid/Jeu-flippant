import type { AudioEngine } from "../audio/AudioEngine";
import { footstep } from "../audio/Sounds";
import { CONFIG } from "../config";

/**
 * Le bruit que fait le joueur. Marcher s'entend à 2,5 m, courir à 16 m :
 * le carrelage résonne dans tout le magasin. Joue aussi les pas.
 */
export class NoiseSystem {
  /** Rayon (m) dans lequel le joueur est audible cette frame. */
  radius = 0;
  private stepDistance = 0;

  constructor(private readonly audio: AudioEngine) {}

  /** `carrying` : Farid porte Sabine, ses pas sont plus lourds (et s'entendent un peu plus loin). */
  update(dt: number, speed: number, running: boolean, carrying = false): void {
    const n = CONFIG.noise;
    const loud = running && speed > CONFIG.player.walkSpeed * 1.2;
    this.radius = speed < 0.3 ? 0 : loud ? n.runRadius : carrying ? CONFIG.carry.noiseRadius : n.walkRadius;
    if (speed < 0.3) {
      this.stepDistance = 0;
      return;
    }
    this.stepDistance += speed * dt;
    const stepLength = loud ? n.runStepLength : carrying ? n.walkStepLength * 0.8 : n.walkStepLength;
    if (this.stepDistance >= stepLength) {
      this.stepDistance -= stepLength;
      footstep(this.audio, "body", loud, carrying);
    }
  }

  reset(): void {
    this.radius = 0;
    this.stepDistance = 0;
  }
}
