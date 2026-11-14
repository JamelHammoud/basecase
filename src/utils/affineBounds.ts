import { Box3, Euler, Matrix4, Quaternion, Vector3 } from 'three';
import type { ScenePart } from '../types/robotics';

export function affineBounds(part: ScenePart) {
  const d = part.dimensions;
  const bounds = new Box3(
    new Vector3(-d.width / 2, -d.height / 2, -d.depth / 2),
    new Vector3(d.width / 2, d.height / 2, d.depth / 2),
  );
  const [x, y, z] = part.rotation.map((degrees) => (degrees * Math.PI) / 180);
  const matrix = new Matrix4().compose(
    new Vector3(...part.position),
    new Quaternion().setFromEuler(new Euler(x, y, z)),
    new Vector3(1, 1, 1),
  );

  matrix.multiply(new Matrix4().fromArray(part.sheetTransform!));
  bounds.applyMatrix4(matrix);

  return { min: bounds.min.toArray(), max: bounds.max.toArray() };
}
