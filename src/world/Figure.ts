import { MeshBuilder, Scene, TransformNode, type Mesh } from "../babylon";
import { mat } from "./Materials";
import { consolidate } from "./Merge";

export interface FigureStyle {
  top: string;
  bottom: string;
  skin: string;
  hair: string;
  /** Casquette, bonnet… (couleur), ou rien. */
  hat?: string;
  /** Chignon (Sabine). */
  bun?: boolean;
  /** Échelle de taille. */
  scale?: number;
}

/**
 * Silhouette humaine simple, avec des jambes qui bougent quand elle marche.
 * Sert pour Sabine, les clients insomniaques du début de nuit et Farid sur les caméras.
 */
export class Figure {
  readonly root: TransformNode;
  private readonly hips: TransformNode[] = [];
  private phase = 0;

  constructor(scene: Scene, name: string, style: FigureStyle, layerMask?: number) {
    this.root = new TransformNode(name, scene);
    const top = mat(scene, `${name}-haut`, style.top);
    const bottom = mat(scene, `${name}-bas`, style.bottom);
    const skin = mat(scene, `${name}-peau`, style.skin);
    const hair = mat(scene, `${name}-cheveux`, style.hair);
    const meshes: Mesh[] = [];
    const add = <T extends Mesh>(m: T, parent: TransformNode = this.root): T => {
      m.parent = parent;
      m.isPickable = false;
      meshes.push(m);
      return m;
    };

    const torso = add(MeshBuilder.CreateCylinder(`${name}-buste`, { diameterTop: 0.42, diameterBottom: 0.36, height: 0.64, tessellation: 12 }, scene));
    torso.position.y = 1.22;
    torso.material = top;
    const pelvis = add(MeshBuilder.CreateCylinder(`${name}-bassin`, { diameter: 0.34, height: 0.16, tessellation: 12 }, scene));
    pelvis.position.y = 0.86;
    pelvis.material = bottom;
    for (const side of [-1, 1]) {
      const hip = new TransformNode(`${name}-hanche`, scene);
      hip.parent = this.root;
      hip.position.set(side * 0.09, 0.82, 0);
      const leg = add(MeshBuilder.CreateBox(`${name}-jambe`, { width: 0.13, height: 0.8, depth: 0.15 }, scene), hip);
      leg.position.y = -0.4;
      leg.material = bottom;
      this.hips.push(hip);
      const arm = add(MeshBuilder.CreateCylinder(`${name}-bras`, { diameterTop: 0.1, diameterBottom: 0.08, height: 0.6, tessellation: 8 }, scene));
      arm.position.set(side * 0.25, 1.2, 0);
      arm.rotation.z = side * 0.08;
      arm.material = top;
    }
    const head = add(MeshBuilder.CreateSphere(`${name}-tete`, { diameterX: 0.2, diameterY: 0.24, diameterZ: 0.22, segments: 10 }, scene));
    head.position.y = 1.68;
    head.material = skin;
    const hairCap = add(MeshBuilder.CreateSphere(`${name}-coiffure`, { diameterX: 0.22, diameterY: 0.2, diameterZ: 0.24, segments: 10, slice: 0.6 }, scene));
    hairCap.position.set(0, 1.72, -0.01);
    hairCap.material = hair;
    if (style.bun) {
      const bun = add(MeshBuilder.CreateSphere(`${name}-chignon`, { diameter: 0.11, segments: 8 }, scene));
      bun.position.set(0, 1.78, -0.1);
      bun.material = hair;
    }
    if (style.hat) {
      const hatMat = mat(scene, `${name}-chapeau`, style.hat);
      const cap = add(MeshBuilder.CreateCylinder(`${name}-casquette`, { diameter: 0.23, height: 0.07, tessellation: 12 }, scene));
      cap.position.set(0, 1.8, 0.01);
      cap.material = hatMat;
      const visor = add(MeshBuilder.CreateBox(`${name}-visiere`, { width: 0.18, height: 0.02, depth: 0.1 }, scene));
      visor.position.set(0, 1.78, 0.14);
      visor.material = hatMat;
    }
    if (layerMask !== undefined) for (const m of meshes) m.layerMask = layerMask;
    // Tout ce qui ne bouge pas (buste, bras, tête…) fusionné par matériau ; les jambes restent à part.
    consolidate(this.root, (m) => this.hips.includes(m.parent as TransformNode));
    if (style.scale) this.root.scaling.setAll(style.scale);
  }

  get enabled(): boolean {
    return this.root.isEnabled(false);
  }

  setEnabled(on: boolean): void {
    this.root.setEnabled(on);
  }

  /** Pose + balancement des jambes selon la vitesse (m/s). */
  update(dt: number, x: number, z: number, yaw: number, speed: number): void {
    this.root.position.set(x, 0, z);
    this.root.rotation.y = yaw;
    this.phase += dt * speed * 4.5;
    const swing = Math.min(1, speed / 1.2) * 0.5;
    this.hips[0].rotation.x = Math.sin(this.phase) * swing;
    this.hips[1].rotation.x = -Math.sin(this.phase) * swing;
  }

  /** Assise (Sabine derrière sa caisse) ou debout. */
  setSitting(on: boolean): void {
    for (const h of this.hips) h.rotation.x = on ? -1.4 : 0;
    this.root.position.y = on ? -0.38 : 0;
  }

  /** Recalcule les matrices après un déplacement hors de la boucle de rendu (caméras). */
  refreshMatrices(): void {
    this.root.computeWorldMatrix(true);
    for (const n of this.root.getDescendants(false)) (n as TransformNode).computeWorldMatrix?.(true);
  }
}
