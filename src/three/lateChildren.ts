import type * as THREE from 'three';

const listeners = new Set<(group: THREE.Object3D) => void>();

export function noteLateChildren(group: THREE.Object3D): void {
  listeners.forEach((listener) => listener(group));
}

export function onLateChildren(listener: (group: THREE.Object3D) => void): () => void {
  listeners.add(listener);

  return () => listeners.delete(listener);
}
