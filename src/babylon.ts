/**
 * Tout ce que le jeu utilise de Babylon.js, en imports profonds.
 *
 * Importer l'index de @babylonjs/core embarque tout le moteur (~7 Mo de JS à télécharger
 * et à analyser au chargement). Ici, on ne prend que ce qui sert, plus les quelques modules
 * « à effet de bord » qui ajoutent des méthodes au moteur (picking, collisions, thin instances…).
 */
export { Engine } from "@babylonjs/core/Engines/engine";
export { Scene } from "@babylonjs/core/scene";
export { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
export { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
export { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
export { Mesh } from "@babylonjs/core/Meshes/mesh";
export { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
export { TransformNode } from "@babylonjs/core/Meshes/transformNode";
export type { Material } from "@babylonjs/core/Materials/material";
export { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
export { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
export { Effect } from "@babylonjs/core/Materials/effect";
export { Texture } from "@babylonjs/core/Materials/Textures/texture";
export { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
export { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
export { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
export { PointLight } from "@babylonjs/core/Lights/pointLight";
export { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
export { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
export { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
export { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation";

// Effets de bord : méthodes ajoutées au moteur.
import "@babylonjs/core/Culling/ray"; // scene.pickWithRay
import "@babylonjs/core/Collisions/collisionCoordinator"; // moveWithCollisions
import "@babylonjs/core/Meshes/thinInstanceMesh"; // thinInstanceSetBuffer
