import type * as THREE from 'three';

const MOVE_MM = 0.01;
const TURN = 1e-5;
const isTranslation = (i: number) => i >= 12 && i < 15;

export function sameMatrix(a: THREE.Matrix4, b: THREE.Matrix4): boolean {
  const theirs = b.elements;

  return a.elements.every((value, i) => Math.abs(value - theirs[i]) <= (isTranslation(i) ? MOVE_MM : TURN));
}

export function samePose(a: ReadonlyMap<string, THREE.Matrix4>, b: ReadonlyMap<string, THREE.Matrix4>): boolean {
  if (a.size !== b.size) return false;

  for (const [id, matrix] of a) {
    const other = b.get(id);

    if (!other || !sameMatrix(matrix, other)) return false;
  }

  return true;
}
