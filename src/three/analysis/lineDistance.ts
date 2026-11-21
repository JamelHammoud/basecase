import * as THREE from 'three';

export function prepareLineDistanceSquared(line: THREE.Line3): (point: THREE.Vector3) => number {
  const start = line.start.clone();
  const direction = line.delta(new THREE.Vector3());
  const lengthSquared = direction.dot(direction);
  const offset = new THREE.Vector3();
  const foot = new THREE.Vector3();

  return (point) => {
    offset.subVectors(point, start);

    const t = lengthSquared === 0 ? 0 : direction.dot(offset) / lengthSquared;

    return foot.copy(direction).multiplyScalar(t).add(start).distanceToSquared(point);
  };
}
