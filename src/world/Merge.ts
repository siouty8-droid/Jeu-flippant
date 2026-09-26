import { Mesh, type AbstractMesh, type TransformNode } from "../babylon";

/**
 * Fusionne les meshes statiques sous `root`, regroupés par matériau (et par drapeaux
 * collision / sélection / calque) : moins de draw calls, rendu plus fluide.
 * Le résultat reste enfant de `root`, à la même place.
 *
 * Ne touche pas : les meshes à instances fines, les invisibles (collisions), ceux marqués
 * `metadata.keep` (objets interactifs) et ceux que `skip` exclut (pièces animées).
 */
export function consolidate(root: TransformNode, skip: (m: AbstractMesh) => boolean = () => false): void {
  root.computeWorldMatrix(true);
  const toLocal = root.getWorldMatrix().clone().invert();
  const groups = new Map<string, Mesh[]>();
  for (const m of root.getChildMeshes(false)) {
    if (!(m instanceof Mesh) || skip(m) || m.hasThinInstances || !m.isVisible || !m.material || m.metadata?.keep) continue;
    if (m.getTotalVertices() === 0 || m.getChildMeshes().length > 0) continue;
    const key = `${m.material.uniqueId}|${m.checkCollisions}|${m.isPickable}|${m.layerMask}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = []));
    g.push(m);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const { checkCollisions, isPickable, layerMask, material } = group[0];
    for (const m of group) m.computeWorldMatrix(true);
    const merged = Mesh.MergeMeshes(group, true, true);
    if (!merged) continue;
    merged.bakeTransformIntoVertices(toLocal);
    merged.parent = root;
    merged.material = material;
    merged.checkCollisions = checkCollisions;
    merged.isPickable = isPickable;
    merged.layerMask = layerMask;
    merged.name = `${root.name}-fusion`;
  }
}
