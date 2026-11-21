import * as THREE from 'three';
import type { SweepRequest } from '../../utils/engineeringTypes';

export function prepareSweepRotation(spec: Pick<SweepRequest, 'origin' | 'axis'>): (angle: number) => THREE.Matrix4 {
  const [x, y, z] = spec.origin;
  const axis = new THREE.Vector3(...spec.axis).normalize();
  const toPivot = new THREE.Matrix4().makeTranslation(x, y, z);
  const fromPivot = new THREE.Matrix4().makeTranslation(-x, -y, -z);
  const turn = new THREE.Matrix4();
  const rotation = new THREE.Matrix4();

  return (angle) =>
    rotation
      .copy(toPivot)
      .multiply(turn.makeRotationAxis(axis, THREE.MathUtils.degToRad(angle)))
      .multiply(fromPivot);
}
