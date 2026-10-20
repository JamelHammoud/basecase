import * as THREE from 'three';
import type { V3 } from '../guideTypes';

export interface Frame {
  camera: THREE.OrthographicCamera;
  widthMm: number;
  heightMm: number;
}

const corners = (box: THREE.Box3) =>
  [0, 1, 2, 3, 4, 5, 6, 7].map(
    (i) =>
      new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z),
  );

function localBounds(boxes: THREE.Box3[], camera: THREE.Camera): THREE.Box3 {
  const local = new THREE.Box3();

  for (const box of boxes) {
    for (const p of corners(box)) local.expandByPoint(p.applyMatrix4(camera.matrixWorldInverse));
  }

  return local;
}

export function frameBoxes(boxes: THREE.Box3[], dir: V3, marginMm: number, depthBoxes: THREE.Box3[] = boxes): Frame {
  const all = [...boxes, ...depthBoxes].reduce((acc, b) => acc.union(b), new THREE.Box3());
  const center = all.getCenter(new THREE.Vector3());
  const radius = Math.max(all.getSize(new THREE.Vector3()).length() / 2, 1);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  const view = new THREE.Vector3(...dir).normalize();

  camera.up.set(0, 1, 0);
  camera.position.copy(center).addScaledVector(view, radius * 4);
  camera.lookAt(center);
  camera.updateMatrixWorld(true);

  const local = localBounds(boxes, camera);
  const depth = localBounds(depthBoxes, camera);

  camera.left = local.min.x - marginMm;
  camera.right = local.max.x + marginMm;
  camera.bottom = local.min.y - marginMm;
  camera.top = local.max.y + marginMm;
  camera.near = Math.max(0.1, -depth.max.z - radius * 0.2);
  camera.far = -depth.min.z + radius * 0.2;
  camera.updateProjectionMatrix();

  return { camera, widthMm: camera.right - camera.left, heightMm: camera.top - camera.bottom };
}

export function projectPoint(camera: THREE.Camera, point: V3, width: number, height: number): [number, number] {
  const p = new THREE.Vector3(...point).project(camera);

  return [((p.x + 1) / 2) * width, ((1 - p.y) / 2) * height];
}

export const VIEW_DIRECTIONS: Record<'front' | 'back' | 'left' | 'right', V3> = {
  front: [0.78, 0.62, 1.15],
  back: [-0.78, 0.62, -1.15],
  left: [1.15, 0.62, -0.78],
  right: [-1.15, 0.62, 0.78],
};

export type ViewName = keyof typeof VIEW_DIRECTIONS;
