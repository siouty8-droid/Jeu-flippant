import { Color3, Matrix, MeshBuilder, Quaternion, StandardMaterial, Vector3, type Mesh, type Scene } from "@babylonjs/core";
import { Rng } from "../core/Rng";

const MAX_BADGES = 32;
/** Sur la table du local technique. */
const TABLE = { x: 4.2, y: 0.805, z: 57.9 };

/**
 * La pile de badges du local technique (fin cachée). Des cartes plastifiées en vrac,
 * une de plus à chaque nuit recommencée.
 */
export class BadgePile {
  private readonly mesh: Mesh;
  /** Volume invisible plus large que la pile, pour la viser facilement avec E. */
  readonly proxy: Mesh;

  constructor(scene: Scene) {
    this.mesh = MeshBuilder.CreateBox("badges", { width: 0.086, height: 0.004, depth: 0.054 }, scene);
    const m = new StandardMaterial("badges", scene);
    m.diffuseColor = new Color3(0.92, 0.92, 0.9);
    m.specularColor = new Color3(0.3, 0.3, 0.3);
    this.mesh.material = m;
    this.mesh.isPickable = false;
    const rng = new Rng(77);
    const matrices = new Float32Array(MAX_BADGES * 16);
    const colors = new Float32Array(MAX_BADGES * 4);
    for (let i = 0; i < MAX_BADGES; i++) {
      const pos = new Vector3(TABLE.x + rng.range(-0.06, 0.06), TABLE.y + 0.003 + i * 0.0045, TABLE.z + rng.range(-0.05, 0.05));
      Matrix.Compose(Vector3.One(), Quaternion.RotationYawPitchRoll(rng.range(-0.9, 0.9), 0, 0), pos).copyToArray(matrices, i * 16);
      // Des cartes blanches, jaunies pour les plus vieilles (en bas de la pile).
      const age = 1 - i / MAX_BADGES;
      colors.set([1, 1 - age * 0.12, 1 - age * 0.3, 1], i * 4);
    }
    this.mesh.thinInstanceSetBuffer("matrix", matrices, 16, true);
    this.mesh.thinInstanceSetBuffer("color", colors, 4, true);
    this.mesh.thinInstanceRefreshBoundingInfo(false);

    this.proxy = MeshBuilder.CreateBox("badges-visee", { width: 0.36, height: 0.2, depth: 0.32 }, scene);
    this.proxy.position.set(TABLE.x, TABLE.y + 0.08, TABLE.z);
    this.proxy.isVisible = false;
    this.proxy.metadata = { pickProxy: true };
  }

  /** Nombre de badges dans la pile. */
  setCount(n: number): void {
    this.mesh.thinInstanceCount = Math.max(1, Math.min(MAX_BADGES, n));
  }
}
