import * as THREE from 'three';
import type { CameraPreset } from '../../types/robotics';
import type { FrameAnimation } from './renderLoop';
import type { Stage } from './stage';
import { MAX_DIST } from './types';

const PRESET_OFFSETS: Partial<Record<CameraPreset, (distance: number) => [number, number, number]>> = {
  top: (d) => [0, d, 0.01],
  front: (d) => [0, 35, d],
  right: (d) => [d, 35, 0],
};

export function setCameraPreset(stage: Stage, preset: CameraPreset): void {
  const { camera, orbit } = stage;
  const target = orbit.target.clone();
  const offset = PRESET_OFFSETS[preset]?.(240) ?? [165, 135, 175];

  camera.position.set(target.x + offset[0], target.y + offset[1], target.z + offset[2]);
  camera.lookAt(target);
  orbit.update();
}

export function focusOn(stage: Stage, object: THREE.Object3D | undefined): void {
  const { camera, orbit } = stage;

  if (object) {
    orbit.target.copy(object.position);
    orbit.update();

    return;
  }

  orbit.target.set(0, 15, 0);
  camera.position.set(165, 135, 175);
  orbit.update();
}

export function frameObjects(stage: Stage, objects: THREE.Object3D[]): FrameAnimation | null {
  const { camera, orbit } = stage;
  const box = new THREE.Box3();

  objects.forEach((object) => box.expandByObject(object));

  if (box.isEmpty()) {
    return null;
  }

  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 30);
  const direction = camera.position.clone().sub(orbit.target).normalize();
  const distance = (radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.15;

  return {
    start: performance.now(),
    fromTarget: orbit.target.clone(),
    toTarget: center,
    fromPos: camera.position.clone(),
    toPos: center.clone().addScaledVector(direction, Math.min(Math.max(distance, 60), MAX_DIST)),
  };
}
