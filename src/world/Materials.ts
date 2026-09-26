import { Color3, DynamicTexture, Scene, StandardMaterial, Texture } from "@babylonjs/core";
import { CONFIG } from "../config";

/** Hémisphérique + le pool de PointLight. */
const MAX_LIGHTS = CONFIG.rendering.lightPoolSize + 1;

export function mat(scene: Scene, name: string, diffuse: string, opts: { specular?: number; emissive?: string } = {}): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = Color3.FromHexString(diffuse);
  m.specularColor = new Color3(opts.specular ?? 0.05, opts.specular ?? 0.05, opts.specular ?? 0.05);
  if (opts.emissive) m.emissiveColor = Color3.FromHexString(opts.emissive);
  m.maxSimultaneousLights = MAX_LIGHTS;
  return m;
}

function canvasTexture(scene: Scene, name: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): DynamicTexture {
  const tex = new DynamicTexture(name, { width: w, height: h }, scene, true);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  draw(ctx);
  tex.update();
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  tex.anisotropicFilteringLevel = 8;
  return tex;
}

function noise(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, count: number): void {
  for (let i = 0; i < count; i++) {
    const v = Math.random() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${Math.random() * amount})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
}

/** Carrelage de supermarché : 4×4 carreaux de 50 cm par texture (2 m). */
function tileTexture(scene: Scene): DynamicTexture {
  return canvasTexture(scene, "tex-carrelage", 512, 512, (ctx) => {
    const n = 4;
    const s = 512 / n;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const shade = 214 + Math.floor(Math.random() * 14);
        ctx.fillStyle = `rgb(${shade},${shade - 3},${shade - 10})`;
        ctx.fillRect(i * s, j * s, s, s);
        // Petites taches, traces de chariot.
        ctx.fillStyle = "rgba(90,80,70,0.05)";
        for (let k = 0; k < 6; k++) ctx.fillRect(i * s + Math.random() * s, j * s + Math.random() * s, 3 + Math.random() * 6, 2);
      }
    }
    noise(ctx, 512, 512, 0.08, 4000);
    ctx.strokeStyle = "rgba(95,90,82,0.9)";
    ctx.lineWidth = 3;
    for (let i = 0; i <= n; i++) {
      ctx.beginPath();
      ctx.moveTo(i * s, 0);
      ctx.lineTo(i * s, 512);
      ctx.moveTo(0, i * s);
      ctx.lineTo(512, i * s);
      ctx.stroke();
    }
  });
}

/** Faux plafond en dalles de 60 cm. */
function ceilingTexture(scene: Scene): DynamicTexture {
  return canvasTexture(scene, "tex-plafond", 256, 256, (ctx) => {
    ctx.fillStyle = "#b9b8b2";
    ctx.fillRect(0, 0, 256, 256);
    noise(ctx, 256, 256, 0.25, 3000);
    ctx.strokeStyle = "#6f6e69";
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, 256, 256);
  });
}

function concreteTexture(scene: Scene): DynamicTexture {
  return canvasTexture(scene, "tex-beton", 256, 256, (ctx) => {
    ctx.fillStyle = "#77736c";
    ctx.fillRect(0, 0, 256, 256);
    noise(ctx, 256, 256, 0.1, 6000);
    ctx.fillStyle = "rgba(40,35,30,0.12)";
    for (let i = 0; i < 12; i++) {
      ctx.beginPath();
      ctx.arc(Math.random() * 256, Math.random() * 256, 10 + Math.random() * 30, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Emballage générique : bandeau d'étiquette + code-barres, multiplié par la couleur d'instance. */
function packagingTexture(scene: Scene): DynamicTexture {
  return canvasTexture(scene, "tex-emballage", 128, 128, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(1, "#cfcfcf");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillRect(10, 44, 108, 34);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(18, 52, 60, 6);
    ctx.fillRect(18, 63, 40, 4);
    for (let x = 84; x < 112; x += 3) ctx.fillRect(x, 50, Math.random() < 0.5 ? 1 : 2, 22);
    ctx.fillStyle = "rgba(0,0,0,0.15)";
    ctx.fillRect(0, 118, 128, 10);
  });
}

function fridgeDoorTexture(scene: Scene): DynamicTexture {
  return canvasTexture(scene, "tex-vitre-frigo", 512, 256, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, "#d8f0ff");
    g.addColorStop(1, "#7fb8e0");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 256);
    // Produits flous derrière la vitre.
    const colors = ["#3a7bd5", "#ffffff", "#c8342b", "#e8d43a", "#2f8f5a"];
    for (let shelf = 0; shelf < 4; shelf++) {
      const y = 30 + shelf * 55;
      for (let x = 6; x < 506; x += 14 + Math.random() * 10) {
        ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
        ctx.globalAlpha = 0.55;
        ctx.fillRect(x, y, 10 + Math.random() * 8, 28 + Math.random() * 10);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#e9f6ff";
      ctx.fillRect(0, y + 40, 512, 4);
    }
    // Montants des portes vitrées.
    ctx.fillStyle = "#dfe3e6";
    for (let x = 0; x <= 512; x += 64) ctx.fillRect(x - 3, 0, 6, 256);
    ctx.fillRect(0, 0, 512, 6);
    ctx.fillRect(0, 250, 512, 6);
  });
}

export interface Materials {
  floor: StandardMaterial;
  floorBack: StandardMaterial;
  ceiling: StandardMaterial;
  wallStore: StandardMaterial;
  wallBack: StandardMaterial;
  wallCold: StandardMaterial;
  wallOffice: StandardMaterial;
  shelfMetal: StandardMaterial;
  shelfWood: StandardMaterial;
  product: StandardMaterial;
  fridgeBody: StandardMaterial;
  fridgeDoor: StandardMaterial;
  neonTube: StandardMaterial;
  neonHousing: StandardMaterial;
  glass: StandardMaterial;
  darkPlastic: StandardMaterial;
  counterTop: StandardMaterial;
  cardboard: StandardMaterial;
  pallet: StandardMaterial;
  emergencyDoor: StandardMaterial;
  exitSign: StandardMaterial;
  monitorScreen: StandardMaterial;
  metalRack: StandardMaterial;
  asphalt: StandardMaterial;
  streetLamp: StandardMaterial;
  pumpkin: StandardMaterial;
  electricalCabinet: StandardMaterial;
  coldLight: StandardMaterial;
}

export function createMaterials(scene: Scene): Materials {
  const floor = mat(scene, "sol", "#ffffff", { specular: 0.35 });
  floor.diffuseTexture = tileTexture(scene);
  floor.specularPower = 48;

  const floorBack = mat(scene, "sol-reserve", "#ffffff", { specular: 0.08 });
  floorBack.diffuseTexture = concreteTexture(scene);

  const ceiling = mat(scene, "plafond", "#ffffff");
  ceiling.diffuseTexture = ceilingTexture(scene);

  const wallBack = mat(scene, "mur-reserve", "#8e8a82");

  const product = mat(scene, "produit", "#ffffff", { specular: 0.12 });
  product.diffuseTexture = packagingTexture(scene);

  const fridgeDoor = mat(scene, "vitre-frigo", "#000000");
  const doorTex = fridgeDoorTexture(scene);
  fridgeDoor.emissiveTexture = doorTex;
  fridgeDoor.diffuseTexture = doorTex;
  fridgeDoor.specularColor = new Color3(0.6, 0.6, 0.6);

  const glass = mat(scene, "verre", "#9fb7c4", { specular: 0.9 });
  glass.alpha = 0.18;
  glass.backFaceCulling = false;

  const exitSign = mat(scene, "panneau-sortie", "#000000", { emissive: "#27c24a" });
  exitSign.disableLighting = true;

  const neonTube = mat(scene, "neon", "#000000", { emissive: "#f4f8ff" });
  neonTube.disableLighting = true;

  const coldLight = mat(scene, "neon-froid", "#000000", { emissive: "#b8e4ff" });
  coldLight.disableLighting = true;

  const streetLamp = mat(scene, "lampadaire", "#000000", { emissive: "#ffb35a" });
  streetLamp.disableLighting = true;

  const monitorScreen = mat(scene, "ecran", "#050806", { emissive: "#0c1a10", specular: 0.6 });

  return {
    floor,
    floorBack,
    ceiling,
    wallStore: mat(scene, "mur-magasin", "#e4e0d6"),
    wallBack,
    wallCold: mat(scene, "mur-froid", "#e9eef0", { specular: 0.3 }),
    wallOffice: mat(scene, "mur-bureau", "#c9c4b4"),
    shelfMetal: mat(scene, "gondole", "#c4c7ca", { specular: 0.25 }),
    shelfWood: mat(scene, "gondole-bois", "#a5774a", { specular: 0.05 }),
    product,
    fridgeBody: mat(scene, "frigo", "#eef1f3", { specular: 0.4 }),
    fridgeDoor,
    neonTube,
    neonHousing: mat(scene, "boitier-neon", "#8c8e90", { specular: 0.2 }),
    glass,
    darkPlastic: mat(scene, "plastique-noir", "#1d1f22", { specular: 0.2 }),
    counterTop: mat(scene, "tapis-caisse", "#2a2a2a", { specular: 0.1 }),
    cardboard: mat(scene, "carton", "#a8834f"),
    pallet: mat(scene, "palette", "#8a6a3e"),
    emergencyDoor: mat(scene, "porte-secours", "#5f6b73", { specular: 0.3 }),
    exitSign,
    monitorScreen,
    metalRack: mat(scene, "rack", "#3b5f8a", { specular: 0.2 }),
    asphalt: mat(scene, "bitume", "#15161a"),
    streetLamp,
    pumpkin: mat(scene, "citrouille", "#e8741c", { specular: 0.2 }),
    electricalCabinet: mat(scene, "armoire-electrique", "#9aa19a", { specular: 0.25 }),
    coldLight,
  };
}

/** Texture de texte (panneaux de rayon, étiquettes). */
export function textTexture(
  scene: Scene,
  name: string,
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): DynamicTexture {
  const tex = new DynamicTexture(name, { width: w, height: h }, scene, true);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  draw(ctx, w, h);
  tex.update();
  tex.anisotropicFilteringLevel = 8;
  return tex;
}
