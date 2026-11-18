import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ShapeKind } from './shapes';

function arrowGeometry() {
  const shaft = new THREE.CylinderGeometry(0.25, 0.25, 0.7, 12).translate(0, 0.35, 0);
  const head = new THREE.ConeGeometry(0.5, 0.3, 16).translate(0, 0.85, 0);

  return mergeGeometries([shaft, head])!.rotateZ(-Math.PI / 2);
}

const SHAPE_GEOMETRY: Record<ShapeKind, () => THREE.BufferGeometry> = {
  cube: () => new THREE.BoxGeometry(1, 1, 1),
  sphere: () => new THREE.SphereGeometry(0.5, 16, 12),
  cylinder: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 20).rotateX(Math.PI / 2),
  arrow: arrowGeometry,
};

export const dataShapeGeometry = (kind: ShapeKind) => SHAPE_GEOMETRY[kind]();
