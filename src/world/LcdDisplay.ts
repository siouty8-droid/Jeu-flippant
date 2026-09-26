import { Color3, DynamicTexture, StandardMaterial, type Scene } from "../babylon";

/** Afficheur à cristaux liquides vert (caisse de la boucherie). Ne redessine que si le texte change. */
export class LcdDisplay {
  readonly material: StandardMaterial;
  private readonly texture: DynamicTexture;
  private text: string | null = null;

  constructor(scene: Scene, name: string) {
    this.texture = new DynamicTexture(`tex-${name}`, { width: 256, height: 84 }, scene, false);
    this.material = new StandardMaterial(name, scene);
    this.material.diffuseColor = new Color3(0, 0, 0);
    this.material.specularColor = new Color3(0, 0, 0);
    this.material.emissiveTexture = this.texture;
    this.material.disableLighting = true;
    this.set("----");
  }

  set(text: string): void {
    if (text === this.text) return;
    this.text = text;
    const ctx = this.texture.getContext() as unknown as CanvasRenderingContext2D;
    const w = 256;
    const h = 84;
    ctx.fillStyle = "#06140a";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#62ff8a";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 62px Courier New, monospace";
    // Espacé à la main : lisible même en basse résolution sur les caméras.
    const chars = text.split("");
    const step = text.length <= 4 ? 58 : 38;
    chars.forEach((c, i) => ctx.fillText(c, w / 2 + (i - (chars.length - 1) / 2) * step, h / 2 + 3));
    this.texture.update();
  }
}
