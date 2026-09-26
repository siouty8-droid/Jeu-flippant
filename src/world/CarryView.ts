import { Color3, MeshBuilder, Quaternion, StandardMaterial, TransformNode, Vector3, type Scene, type UniversalCamera } from "../babylon";

/** Calque visible seulement par la caméra du joueur (pas par les caméras de surveillance). */
export const PLAYER_ONLY_LAYER = 0x20000000;

/**
 * Farid porte Sabine sur son dos : en vue subjective, on voit ses deux bras
 * passés par-dessus ses épaules, qui se balancent à chaque pas.
 */
export class CarryView {
  private readonly root: TransformNode;
  private phase = 0;

  constructor(scene: Scene, camera: UniversalCamera) {
    this.root = new TransformNode("bras-sabine", scene);
    this.root.parent = camera;
    const sleeve = new StandardMaterial("manche-sabine", scene);
    sleeve.diffuseColor = Color3.FromHexString("#8c1f28");
    sleeve.specularColor = new Color3(0.05, 0.05, 0.05);
    const skin = new StandardMaterial("main-sabine", scene);
    skin.diffuseColor = Color3.FromHexString("#b8917c");
    skin.specularColor = new Color3(0.05, 0.05, 0.05);

    // Chaque bras va de l'épaule (derrière Farid) jusqu'à la main, pendante devant lui.
    // (Repère de la caméra : x à droite, y en haut, z devant ; champ vertical ≈ ±36°.)
    const arms: [Vector3, Vector3][] = [
      [new Vector3(0.26, -0.2, 0.0), new Vector3(0.07, -0.25, 0.44)],
      [new Vector3(-0.26, -0.21, 0.0), new Vector3(-0.1, -0.27, 0.42)],
    ];
    for (const [from, to] of arms) {
      const dir = to.subtract(from);
      const length = dir.length();
      const arm = MeshBuilder.CreateCylinder("bras", { diameterTop: 0.07, diameterBottom: 0.09, height: length, tessellation: 10 }, scene);
      arm.parent = this.root;
      arm.position = from.add(to).scale(0.5);
      arm.rotationQuaternion = new Quaternion();
      // L'axe du cylindre va de l'épaule au poignet (le bout fin, en haut, côté main).
      Quaternion.FromUnitVectorsToRef(Vector3.Up(), dir.normalize(), arm.rotationQuaternion);
      arm.material = sleeve;
      const hand = MeshBuilder.CreateSphere("main", { diameterX: 0.07, diameterY: 0.05, diameterZ: 0.1, segments: 8 }, scene);
      hand.parent = this.root;
      hand.position = to.add(dir.normalize().scale(0.05));
      hand.material = skin;
    }
    for (const m of this.root.getChildMeshes()) {
      m.layerMask = PLAYER_ONLY_LAYER;
      // Dessinés par-dessus le décor : les bras ne rentrent jamais dans un mur.
      m.renderingGroupId = 1;
      m.isPickable = false;
    }
    this.root.setEnabled(false);
  }

  setEnabled(on: boolean): void {
    this.root.setEnabled(on);
  }

  update(dt: number, speed: number): void {
    if (!this.root.isEnabled(false)) return;
    this.phase += dt * (0.8 + speed * 2.2);
    this.root.position.set(Math.sin(this.phase) * 0.012, Math.abs(Math.cos(this.phase)) * -0.015, 0);
    this.root.rotation.z = Math.sin(this.phase * 0.5) * 0.03;
  }
}
