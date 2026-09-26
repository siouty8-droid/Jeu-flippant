import { Color4, Matrix, Mesh, MeshBuilder, Quaternion, Scene, StandardMaterial, TransformNode, Vector3 } from "@babylonjs/core";
import { Rng } from "../core/Rng";
import type { Materials } from "./Materials";
import { mat, textTexture } from "./Materials";
import { consolidate } from "./Merge";
import { HALLOWEEN_MODULE, RAYON_9, STORE, type Box3, type FixtureStyle, type ModuleDef } from "./StoreLayout";

/**
 * Construit un module (un rayon) en coordonnées locales, centré sur l'origine.
 * L'allée court le long de z ; les deux gondoles sont en x = ±2.4.
 * Le module est ensuite posé dans un slot en déplaçant son TransformNode :
 * c'est ce qui rendra le réagencement (règle 1) trivial côté 3D.
 */

const GONDOLA_X = 2.4;
const GONDOLA_DEPTH = 1.2;
const GONDOLA_LENGTH = 8;
const FRIDGE_HEIGHT = 2.2;

interface StyleParams {
  height: number;
  levels: number[];
  productW: [number, number];
  productH: [number, number];
  facings: [number, number];
  wood: boolean;
}

const STYLE_PARAMS: Record<Exclude<FixtureStyle, "fridge" | "display">, StyleParams> = {
  shelf: { height: 2.15, levels: [0.14, 0.52, 0.9, 1.28, 1.66], productW: [0.1, 0.32], productH: [0.14, 0.33], facings: [2, 6], wood: false },
  butcher: { height: 2.15, levels: [0.14, 0.6, 1.06, 1.52], productW: [0.18, 0.3], productH: [0.06, 0.12], facings: [3, 8], wood: false },
  bakery: { height: 1.95, levels: [0.14, 0.62, 1.1, 1.52], productW: [0.14, 0.4], productH: [0.1, 0.24], facings: [1, 4], wood: true },
  produce: { height: 1.45, levels: [0.3, 0.8], productW: [0.3, 0.55], productH: [0.14, 0.24], facings: [1, 2], wood: true },
};

export interface ModuleInstance {
  def: ModuleDef;
  root: TransformNode;
  /**
   * Volumes opaques du module en coordonnées locales (gondoles, frigos, comptoirs).
   * L'OcclusionMap s'en sert pour savoir ce que le joueur peut voir.
   */
  localBoxes: Box3[];
}

export class ModuleFactory {
  constructor(
    private readonly scene: Scene,
    private readonly mats: Materials,
    private readonly rng: Rng,
  ) {}

  build(def: ModuleDef): ModuleInstance {
    const root = new TransformNode(`module-${def.id}`, this.scene);
    const rng = this.rng.fork(`module-${def.id}`);
    const localBoxes: Box3[] = [];
    const products = new ProductBatch(`produits-${def.id}`, this.scene, this.mats.product);
    const block = (x: number, height: number, halfW = GONDOLA_DEPTH / 2, halfL = GONDOLA_LENGTH / 2, z = 0) =>
      localBoxes.push({ minX: x - halfW, maxX: x + halfW, minY: 0, maxY: height, minZ: z - halfL, maxZ: z + halfL });

    switch (def.style) {
      case "fridge":
        for (const side of [-1, 1]) {
          this.fridge(def, root, side * GONDOLA_X);
          block(side * GONDOLA_X, FRIDGE_HEIGHT);
        }
        break;
      case "display":
        this.halloweenDisplay(root, rng);
        for (const z of [-2.2, 2.2]) block(0, 0.7, 0.55, 0.45, z);
        break;
      case "butcher":
        this.gondola(def, root, -GONDOLA_X, STYLE_PARAMS.butcher, rng, products);
        block(-GONDOLA_X, STYLE_PARAMS.butcher.height);
        this.butcherCounter(def, root, GONDOLA_X, rng, products);
        block(GONDOLA_X, 0.9);
        break;
      default:
        for (const side of [-1, 1]) {
          this.gondola(def, root, side * GONDOLA_X, STYLE_PARAMS[def.style], rng, products);
          block(side * GONDOLA_X, STYLE_PARAMS[def.style].height);
        }
    }

    products.finish(root);
    if (def.id !== HALLOWEEN_MODULE) this.signs(def, root);
    consolidate(root);
    return { def, root, localBoxes };
  }

  /** Gondole double face : plinthe, dos central, tablettes, joues, produits des deux côtés. */
  private gondola(def: ModuleDef, root: TransformNode, x: number, p: StyleParams, rng: Rng, products: ProductBatch): Mesh {
    const parts: Mesh[] = [];
    const box = (w: number, h: number, d: number, px: number, py: number, pz: number) => {
      const b = MeshBuilder.CreateBox("g", { width: w, height: h, depth: d }, this.scene);
      b.position.set(px, py, pz);
      parts.push(b);
    };
    box(GONDOLA_DEPTH, 0.12, GONDOLA_LENGTH, x, 0.06, 0);
    box(0.08, p.height, GONDOLA_LENGTH, x, p.height / 2, 0);
    for (const y of p.levels) box(GONDOLA_DEPTH, 0.03, GONDOLA_LENGTH, x, y, 0);
    box(GONDOLA_DEPTH, 0.04, GONDOLA_LENGTH, x, p.height, 0);
    for (const z of [-GONDOLA_LENGTH / 2, GONDOLA_LENGTH / 2]) box(GONDOLA_DEPTH, p.height, 0.05, x, p.height / 2, z);
    // Porte-étiquettes : liseré sombre sur le bord avant de chaque tablette.
    for (const y of p.levels) for (const s of [-1, 1]) box(0.02, 0.04, GONDOLA_LENGTH, x + s * (GONDOLA_DEPTH / 2), y - 0.01, 0);

    const merged = Mesh.MergeMeshes(parts, true, true)!;
    merged.name = `gondole-${def.id}`;
    merged.material = p.wood ? this.mats.shelfWood : this.mats.shelfMetal;
    merged.parent = root;
    merged.checkCollisions = true;

    const faded = def.id === RAYON_9;
    for (const side of [-1, 1]) {
      for (let li = 0; li < p.levels.length; li++) {
        const y = p.levels[li] + 0.015;
        const ceilingY = li + 1 < p.levels.length ? p.levels[li + 1] : p.height;
        const maxH = Math.min(p.productH[1], ceilingY - y - 0.05);
        let z = -GONDOLA_LENGTH / 2 + 0.06;
        while (z < GONDOLA_LENGTH / 2 - 0.12) {
          const w = rng.range(p.productW[0], p.productW[1]);
          const h = rng.range(p.productH[0], Math.max(p.productH[0], maxH));
          const d = rng.range(0.28, 0.5);
          const color = rng.pick(def.palette);
          const facings = rng.int(p.facings[0], p.facings[1]);
          // Quelques trous dans les rayons, comme en fin de journée.
          const gap = rng.chance(0.08);
          for (let f = 0; f < facings && z + w < GONDOLA_LENGTH / 2 - 0.06; f++) {
            if (!gap) {
              const px = x + side * (GONDOLA_DEPTH / 2 - d / 2 - 0.03);
              products.add(px, y + h / 2, z + w / 2, w * 0.96, h, d, color, faded ? 0.55 : 1);
            }
            z += w;
          }
          z += 0.01;
        }
      }
    }
    return merged;
  }

  /** Surgelés : armoires à portes vitrées lumineuses, double face. */
  private fridge(def: ModuleDef, root: TransformNode, x: number): Mesh {
    const h = FRIDGE_HEIGHT;
    const body = MeshBuilder.CreateBox(`frigo-${def.id}`, { width: GONDOLA_DEPTH, height: h, depth: GONDOLA_LENGTH }, this.scene);
    body.position.set(x, h / 2, 0);
    body.material = this.mats.fridgeBody;
    body.parent = root;
    body.checkCollisions = true;
    for (const s of [-1, 1]) {
      const door = MeshBuilder.CreatePlane("vitre", { width: GONDOLA_LENGTH - 0.1, height: 1.7 }, this.scene);
      door.position.set(x + s * (GONDOLA_DEPTH / 2 + 0.005), 1.1, 0);
      // Le plan regarde -z par défaut : on le tourne pour qu'il fasse face à l'allée.
      door.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
      door.material = this.mats.fridgeDoor;
      door.parent = root;
    }
    return body;
  }

  /** Boucherie : vitrine réfrigérée basse + caisse enregistreuse fermée en bout de comptoir. */
  private butcherCounter(def: ModuleDef, root: TransformNode, x: number, rng: Rng, products: ProductBatch): void {
    const base = MeshBuilder.CreateBox("comptoir-boucherie", { width: GONDOLA_DEPTH, height: 0.9, depth: GONDOLA_LENGTH }, this.scene);
    base.position.set(x, 0.45, 0);
    base.material = this.mats.fridgeBody;
    base.parent = root;
    base.checkCollisions = true;

    const glass = MeshBuilder.CreateBox("vitrine-boucherie", { width: 0.9, height: 0.45, depth: GONDOLA_LENGTH - 0.2 }, this.scene);
    glass.position.set(x + 0.1, 1.13, 0);
    glass.material = this.mats.glass;
    glass.parent = root;

    const lamp = MeshBuilder.CreateBox("lampe-vitrine", { width: 0.9, height: 0.02, depth: GONDOLA_LENGTH - 0.3 }, this.scene);
    lamp.position.set(x + 0.1, 1.34, 0);
    lamp.material = this.mats.coldLight;
    lamp.parent = root;

    for (let z = -GONDOLA_LENGTH / 2 + 0.3; z < GONDOLA_LENGTH / 2 - 0.4; z += rng.range(0.28, 0.42)) {
      for (const dx of [-0.2, 0.15]) {
        products.add(x + dx, 0.94, z, rng.range(0.2, 0.3), 0.06, rng.range(0.16, 0.26), rng.pick(def.palette), 1);
      }
    }

    // La caisse enregistreuse (le double de la clé de la chambre froide sera dedans).
    const register = MeshBuilder.CreateBox("caisse-boucherie", { width: 0.4, height: 0.22, depth: 0.35 }, this.scene);
    register.position.set(x - 0.2, 1.01, GONDOLA_LENGTH / 2 - 0.3);
    register.material = this.mats.darkPlastic;
    register.parent = root;
    // Objet interactif plus tard (le double de clé est dedans) : on ne le fusionne pas.
    register.metadata = { keep: true };
    const screen = MeshBuilder.CreateBox("ecran-caisse-boucherie", { width: 0.25, height: 0.14, depth: 0.02 }, this.scene);
    screen.position.set(x - 0.2, 1.2, GONDOLA_LENGTH / 2 - 0.42);
    screen.rotation.x = -0.35;
    screen.material = this.mats.monitorScreen;
    screen.parent = root;
  }

  /** Présentoir Halloween qui occupe le slot vide (là où apparaîtra le rayon 9). */
  private halloweenDisplay(root: TransformNode, rng: Rng): void {
    const parts: Mesh[] = [];
    for (const z of [-2.2, 2.2]) {
      const pallet = MeshBuilder.CreateBox("palette", { width: 1.2, height: 0.15, depth: 1.0 }, this.scene);
      pallet.position.set(0, 0.075, z);
      parts.push(pallet);
    }
    const pallets = Mesh.MergeMeshes(parts, true)!;
    pallets.material = this.mats.pallet;
    pallets.parent = root;

    const crates: Mesh[] = [];
    for (const z of [-2.2, 2.2]) {
      const crate = MeshBuilder.CreateBox("caisse", { width: 1.1, height: 0.55, depth: 0.9 }, this.scene);
      crate.position.set(0, 0.425, z);
      crates.push(crate);
    }
    const crateMesh = Mesh.MergeMeshes(crates, true)!;
    crateMesh.material = this.mats.cardboard;
    crateMesh.parent = root;
    crateMesh.checkCollisions = true;

    const pumpkin = MeshBuilder.CreateSphere("citrouille", { diameter: 1, segments: 8 }, this.scene);
    pumpkin.material = this.mats.pumpkin;
    pumpkin.parent = root;
    const matrices: number[] = [];
    for (const z of [-2.2, 2.2]) {
      for (let i = 0; i < 9; i++) {
        const s = rng.range(0.22, 0.34);
        const m = Matrix.Compose(
          new Vector3(s, s * 0.8, s),
          Quaternion.RotationYawPitchRoll(rng.range(0, Math.PI), 0, 0),
          new Vector3(rng.range(-0.4, 0.4), 0.7 + s * 0.4, z + rng.range(-0.3, 0.3)),
        );
        matrices.push(...m.asArray());
      }
    }
    pumpkin.thinInstanceSetBuffer("matrix", new Float32Array(matrices), 16);
    pumpkin.thinInstanceRefreshBoundingInfo(false);

    const sign = MeshBuilder.CreatePlane("pancarte-halloween", { width: 1.4, height: 0.7 }, this.scene);
    sign.position.set(0, 1.6, 0);
    const m = mat(this.scene, "pancarte-halloween", "#ffffff");
    m.diffuseTexture = textTexture(this.scene, "tex-halloween", 512, 256, (ctx, w, h) => {
      ctx.fillStyle = "#e8741c";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#1a1a1a";
      ctx.font = "bold 70px Arial";
      ctx.textAlign = "center";
      ctx.fillText("HALLOWEEN", w / 2, 105);
      ctx.font = "bold 48px Arial";
      ctx.fillText("-30 % sur les bonbons", w / 2, 190);
    });
    m.backFaceCulling = false;
    sign.material = m;
    sign.parent = root;
    const pole = MeshBuilder.CreateCylinder("poteau", { diameter: 0.05, height: 1.6 }, this.scene);
    pole.position.set(0, 0.8, 0);
    pole.material = this.mats.shelfMetal;
    pole.parent = root;
  }

  /** Panneaux suspendus aux deux bouts de l'allée, lisibles depuis les allées transversales. */
  private signs(def: ModuleDef, root: TransformNode): void {
    const isNine = def.id === RAYON_9;
    const m = mat(this.scene, `panneau-${def.id}`, "#ffffff");
    const tex = textTexture(this.scene, `tex-panneau-${def.id}`, 1024, 256, (ctx, w, h) => {
      ctx.fillStyle = isNine ? "#3a3a36" : "#1b3561";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = isNine ? "#8a8a80" : "#f2c230";
      ctx.beginPath();
      ctx.arc(128, h / 2, 92, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = isNine ? "#2a2a26" : "#1b3561";
      ctx.font = "bold 130px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(def.id), 128, h / 2 + 6);
      ctx.fillStyle = isNine ? "#9a9a90" : "#ffffff";
      ctx.font = "bold 78px Arial";
      ctx.textAlign = "left";
      ctx.fillText(def.name.toUpperCase(), 260, h / 2 + 4);
    });
    m.diffuseTexture = tex;
    m.emissiveTexture = tex;
    m.emissiveColor.set(0.35, 0.35, 0.35);

    const z = STORE.cellDepth / 2 + 0.1;
    const wires: Mesh[] = [];
    for (const end of [-1, 1]) {
      const sign = MeshBuilder.CreatePlane(`panneau-${def.id}`, { width: 2.4, height: 0.6 }, this.scene);
      sign.position.set(0, 3.1, end * z);
      // Le plan regarde -z : côté avant (end = -1) il est déjà dans le bon sens.
      sign.rotation.y = end > 0 ? Math.PI : 0;
      sign.material = m;
      sign.parent = root;
      for (const dx of [-1, 1]) {
        const wire = MeshBuilder.CreateBox("fil", { width: 0.012, height: STORE.height - 3.4, depth: 0.012 }, this.scene);
        wire.position.set(dx * 1.0, 3.4 + (STORE.height - 3.4) / 2, end * z);
        wires.push(wire);
      }
    }
    // Les quatre fils en un seul mesh.
    const merged = Mesh.MergeMeshes(wires, true)!;
    merged.material = this.mats.darkPlastic;
    merged.parent = root;
    merged.isPickable = false;
  }
}

/** Tous les produits d'un module en un seul mesh à instances fines (une draw call). */
class ProductBatch {
  private matrices: number[] = [];
  private colors: number[] = [];

  constructor(
    private readonly name: string,
    private readonly scene: Scene,
    private readonly material: StandardMaterial,
  ) {}

  add(x: number, y: number, z: number, w: number, h: number, d: number, hex: string, brightness: number): void {
    // Largeur w le long de z (l'allée), profondeur d le long de x.
    const m = Matrix.Compose(new Vector3(d, h, w), Quaternion.Identity(), new Vector3(x, y, z));
    this.matrices.push(...m.asArray());
    const c = Color4.FromHexString(hex.length === 7 ? `${hex}ff` : hex);
    const jitter = 0.9 + Math.random() * 0.1;
    this.colors.push(c.r * brightness * jitter, c.g * brightness * jitter, c.b * brightness * jitter, 1);
  }

  finish(root: TransformNode): void {
    if (this.matrices.length === 0) return;
    const mesh = MeshBuilder.CreateBox(this.name, { size: 1 }, this.scene);
    mesh.material = this.material;
    mesh.parent = root;
    mesh.thinInstanceSetBuffer("matrix", new Float32Array(this.matrices), 16);
    mesh.thinInstanceSetBuffer("color", new Float32Array(this.colors), 4);
    mesh.thinInstanceRefreshBoundingInfo(false);
    mesh.isPickable = false;
  }
}
