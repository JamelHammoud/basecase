import { getComponentMesh } from '../../three/componentMeshes';
import type { ScenePart } from '../../types/robotics';

const UV_PRIMITIVES = new Set([
  'box',
  'cube',
  'cylinder',
  'tube',
  'sphere',
  'torus',
  'cone',
  'capsule',
  'dome',
  'hex_prism',
  'pyramid',
]);

export function supportsMeshUvs(part: ScenePart): boolean {
  if (part.sculptMesh || part.edges?.mm) return false;

  if (part.componentId)
    return getComponentMesh(part.componentId)?.pieces.every((piece) => piece.geometry.hasAttribute('uv')) ?? false;

  if (part.mesh) return !!part.mesh.uvs;

  return UV_PRIMITIVES.has(part.kind);
}
