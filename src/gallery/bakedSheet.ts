import { Box3, Euler, Vector3 } from 'three';
import type { ScenePart } from '../types/robotics';

export function bakedSheet(part: ScenePart, triangles: Float32Array) {
  if (!part.sheetTransform) return { part, triangles };

  const bounds = new Box3().setFromArray(triangles);
  const center = bounds.getCenter(new Vector3());
  const size = bounds.getSize(new Vector3());
  const [x, y, z] = part.rotation.map((degrees) => (degrees * Math.PI) / 180);
  const offset = center.clone().applyEuler(new Euler(x, y, z));
  const baked: ScenePart = {
    ...part,
    sheetTransform: undefined,
    dimensions: { ...part.dimensions, width: size.x, height: size.y, depth: size.z },
    position: new Vector3(...part.position).add(offset).toArray(),
    com: part.com ? new Vector3(...part.com).sub(center).toArray() : undefined,
  };

  return {
    part: baked,
    triangles: Float32Array.from(triangles, (value, index) => value - center.getComponent(index % 3)),
  };
}
