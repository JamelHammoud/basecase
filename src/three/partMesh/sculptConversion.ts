import * as THREE from 'three';
import type { ScenePart, SculptMeshData } from '../../types/robotics';
import {
  buildBufferGeometryFromSculptData,
  tessellateGeometryForSculpting,
  weldAndNormalizeGeometry,
} from '../sculptAndBooleanEngine';
import type { GroupBuilder } from './customModel';

const refineSculpt = (part: ScenePart) => {
  const { width, height, depth } = part.dimensions;
  const current = buildBufferGeometryFromSculptData(part.sculptMesh!, width, height, depth);

  return weldAndNormalizeGeometry(tessellateGeometryForSculpting(current, 1));
};

const worldTriangleSoup = (group: THREE.Group) => {
  const coords: number[] = [];

  group.updateMatrixWorld(true);
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.geometry) {
      return;
    }

    const geometry = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();

    geometry.applyMatrix4(child.matrixWorld);

    const position = tessellateGeometryForSculpting(geometry, 2).getAttribute('position') as THREE.BufferAttribute;

    for (let i = 0; i < position.count * 3; i++) coords.push(position.array[i]);
  });

  return coords;
};

export function convertPartToSculptMesh(part: ScenePart, build: GroupBuilder): SculptMeshData {
  if (part.sculptMesh && part.sculptMesh.positions.length >= 9) {
    return refineSculpt(part);
  }

  const group = build({ ...part, position: [0, 0, 0], rotation: [0, 0, 0] }, false);
  const combined = new THREE.BufferGeometry();

  combined.setAttribute('position', new THREE.Float32BufferAttribute(worldTriangleSoup(group), 3));

  return weldAndNormalizeGeometry(combined);
}
