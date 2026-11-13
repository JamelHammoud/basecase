import * as THREE from 'three';
import { ADDITION, Brush, Evaluator, INTERSECTION, SUBTRACTION } from 'three-bvh-csg';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BooleanOp } from '../types/robotics';
import type { WeldedMesh } from './csg';

const OPERATIONS = { subtract: SUBTRACTION, union: ADDITION, intersect: INTERSECTION } as const;

function brushOf(mesh: WeldedMesh): Brush {
  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  geometry.computeVertexNormals();
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(mesh.positions.length / 1.5), 2));

  const brush = new Brush(geometry);

  brush.updateMatrixWorld();

  return brush;
}

export function bvhCsg(op: BooleanOp, operands: WeldedMesh[]): WeldedMesh | null {
  const evaluator = new Evaluator();

  evaluator.useGroups = false;

  const [first, ...rest] = operands.map(brushOf);
  const result = rest.reduce((acc, brush) => evaluator.evaluate(acc, brush, OPERATIONS[op]), first);
  const plain = new THREE.BufferGeometry();

  plain.setAttribute('position', result.geometry.getAttribute('position'));

  const welded = mergeVertices(plain, 1e-4);

  if (!welded.index || welded.index.count < 3) return null;

  return {
    positions: welded.getAttribute('position').array as Float32Array,
    indices: new Uint32Array(welded.index.array as ArrayLike<number>),
  };
}
