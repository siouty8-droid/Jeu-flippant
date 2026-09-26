import { Color4, Matrix, MeshBuilder, Quaternion, Scene, TransformNode, Vector3 } from "@babylonjs/core";
import type { Rng } from "../core/Rng";
import type { Materials } from "./Materials";
import { mat, textTexture } from "./Materials";
import { buildCart } from "./Props";

/**
 * Le client de la nuit : manteau long, bonnet, toujours voûté sur son caddie.
 * Pas de visage modélisé : de toute façon, on ne le voit jamais de face.
 */
export class ShopperModel {
  readonly root: TransformNode;
  private readonly legs: TransformNode[] = [];
  private phase = 0;

  constructor(scene: Scene, mats: Materials, rng: Rng) {
    this.root = new TransformNode("client", scene);
    const coat = mat(scene, "manteau", "#3a3226", { specular: 0.04 });
    const trousers = mat(scene, "pantalon", "#24221f");
    const skin = mat(scene, "peau", "#9c8574");
    const beanie = mat(scene, "bonnet", "#5a1f1f");

    const body = MeshBuilder.CreateCylinder("client-manteau", { diameterTop: 0.44, diameterBottom: 0.58, height: 1.1, tessellation: 14 }, scene);
    body.position.set(0, 0.97, 0);
    body.material = coat;
    body.parent = this.root;
    const chest = MeshBuilder.CreateCylinder("client-buste", { diameterTop: 0.5, diameterBottom: 0.44, height: 0.34, tessellation: 14 }, scene);
    chest.position.set(0, 1.68, 0.03);
    chest.rotation.x = 0.18;
    chest.material = coat;
    chest.parent = this.root;
    const collar = MeshBuilder.CreateCylinder("client-col", { diameter: 0.26, height: 0.12, tessellation: 12 }, scene);
    collar.position.set(0, 1.86, 0.08);
    collar.material = coat;
    collar.parent = this.root;
    const head = MeshBuilder.CreateSphere("client-tete", { diameterX: 0.21, diameterY: 0.25, diameterZ: 0.23, segments: 12 }, scene);
    head.position.set(0, 1.98, 0.1);
    head.material = skin;
    head.parent = this.root;
    const hat = MeshBuilder.CreateSphere("client-bonnet", { diameterX: 0.24, diameterY: 0.2, diameterZ: 0.26, segments: 12, slice: 0.55 }, scene);
    hat.position.set(0, 2.02, 0.09);
    hat.material = beanie;
    hat.parent = this.root;

    for (const side of [-1, 1]) {
      const hip = new TransformNode("client-hanche", scene);
      hip.parent = this.root;
      hip.position.set(side * 0.11, 0.48, 0);
      const leg = MeshBuilder.CreateBox("client-jambe", { width: 0.15, height: 0.48, depth: 0.17 }, scene);
      leg.position.set(0, -0.24, 0);
      leg.material = trousers;
      leg.parent = hip;
      this.legs.push(hip);

      // Bras tendus vers la poignée du caddie.
      const shoulder = new TransformNode("client-epaule", scene);
      shoulder.parent = this.root;
      shoulder.position.set(side * 0.26, 1.72, 0.08);
      shoulder.rotation.x = -1.05;
      shoulder.rotation.z = side * 0.12;
      const arm = MeshBuilder.CreateCylinder("client-bras", { diameterTop: 0.12, diameterBottom: 0.1, height: 0.62, tessellation: 8 }, scene);
      arm.position.set(0, -0.31, 0);
      arm.material = coat;
      arm.parent = shoulder;
      const hand = MeshBuilder.CreateSphere("client-main", { diameter: 0.09, segments: 6 }, scene);
      hand.position.set(0, -0.64, 0);
      hand.material = skin;
      hand.parent = shoulder;
    }

    const cart = buildCart(scene, mats, "caddie-client");
    cart.parent = this.root;
    cart.position.set(0, 0, 0.98);
    this.fillCart(scene, cart, rng);

    // Collision pour le joueur : on ne traverse ni le client ni son caddie.
    const collider = MeshBuilder.CreateBox("client-collision", { width: 0.75, height: 1.8, depth: 1.75 }, scene);
    collider.position.set(0, 0.9, 0.55);
    collider.isVisible = false;
    collider.isPickable = false;
    collider.checkCollisions = true;
    collider.parent = this.root;

    this.root.setEnabled(false);
  }

  /** Produits périmés depuis des années, étiquettes en francs. */
  private fillCart(scene: Scene, cart: TransformNode, rng: Rng): void {
    const m = mat(scene, "produit-perime", "#ffffff", { specular: 0.05 });
    m.diffuseTexture = textTexture(scene, "tex-produit-perime", 256, 256, (ctx, w, h) => {
      ctx.fillStyle = "#d9cfb4";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "rgba(90,70,40,0.25)";
      for (let i = 0; i < 30; i++) ctx.fillRect(Math.random() * w, Math.random() * h, 6 + Math.random() * 20, 3 + Math.random() * 8);
      ctx.fillStyle = "#f4eed8";
      ctx.fillRect(20, 120, 216, 110);
      ctx.fillStyle = "#b8261d";
      ctx.font = "bold 58px Arial";
      ctx.textAlign = "center";
      ctx.fillText("4,90 F", w / 2, 178);
      ctx.fillStyle = "#3a3226";
      ctx.font = "22px Arial";
      ctx.fillText("À consommer avant", w / 2, 206);
      ctx.fillText("le 03/1997", w / 2, 228);
    });
    const box = MeshBuilder.CreateBox("courses-client", { size: 1 }, scene);
    box.material = m;
    box.parent = cart;
    box.isPickable = false;
    const palette = ["#b8a88a", "#9a8f7a", "#a89a7a", "#8c9a8a", "#b09080", "#c2b49a"];
    const matrices: number[] = [];
    const colors: number[] = [];
    for (let i = 0; i < 11; i++) {
      const w = rng.range(0.1, 0.22);
      const h = rng.range(0.08, 0.26);
      const d = rng.range(0.1, 0.2);
      const pos = new Vector3(rng.range(-0.18, 0.18), 0.47 + h / 2 + (i > 6 ? 0.12 : 0), rng.range(-0.3, 0.3));
      matrices.push(...Matrix.Compose(new Vector3(w, h, d), Quaternion.RotationYawPitchRoll(rng.range(-0.4, 0.4), 0, 0), pos).asArray());
      const c = Color4.FromHexString(`${rng.pick(palette)}ff`);
      colors.push(c.r, c.g, c.b, 1);
    }
    box.thinInstanceSetBuffer("matrix", new Float32Array(matrices), 16);
    box.thinInstanceSetBuffer("color", new Float32Array(colors), 4);
    box.thinInstanceRefreshBoundingInfo(false);
  }

  setEnabled(on: boolean): void {
    this.root.setEnabled(on);
  }

  update(dt: number, x: number, z: number, bodyYaw: number, speed: number): void {
    this.root.position.set(x, 0, z);
    this.root.rotation.y = bodyYaw;
    this.phase += dt * speed * 4.2;
    const swing = Math.min(1, speed / 1.2) * 0.45;
    this.legs[0].rotation.x = Math.sin(this.phase) * swing;
    this.legs[1].rotation.x = -Math.sin(this.phase) * swing;
  }
}

