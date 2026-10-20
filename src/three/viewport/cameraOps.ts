import * as THREE from 'three';
import type { CameraPreset, ScenePart } from '../../types/robotics';
import { selectionBounds } from '../../utils/selection';
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

const HOME_DIRECTION = new THREE.Vector3(165, 135, 175).normalize();

function fitDistance(camera: THREE.PerspectiveCamera, radius: number): number {
  const halfV = THREE.MathUtils.degToRad(camera.fov / 2);
  const halfH = camera.aspect > 0 ? Math.atan(Math.tan(halfV) * camera.aspect) : halfV;
  const distance = (radius / Math.sin(Math.min(halfV, halfH))) * 1.15;

  return Math.min(Math.max(distance, 60), MAX_DIST);
}

function framing(camera: THREE.PerspectiveCamera, box: THREE.Box3, direction: THREE.Vector3) {
  const target = box.getCenter(new THREE.Vector3());
  const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 30);

  return { target, position: target.clone().addScaledVector(direction, fitDistance(camera, radius)) };
}

function partsBox(parts: ScenePart[]): THREE.Box3 | null {
  const framed = parts.filter((p) => p.visible && p.role !== 'reference' && p.kind !== 'image_plane');

  if (framed.length === 0) {
    return null;
  }

  const { min, max } = selectionBounds(framed);

  return new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max));
}

export function frameScene(stage: Stage, parts: ScenePart[]): void {
  const box = partsBox(parts);

  if (!box) {
    return;
  }

  const { camera, orbit } = stage;
  const { target, position } = framing(camera, box, HOME_DIRECTION);

  orbit.target.copy(target);
  camera.position.copy(position);
  camera.lookAt(target);
  orbit.update();
}

export function frameObjects(stage: Stage, objects: THREE.Object3D[]): FrameAnimation | null {
  const { camera, orbit } = stage;
  const box = new THREE.Box3();

  objects.forEach((object) => box.expandByObject(object));

  if (box.isEmpty()) {
    return null;
  }

  const direction = camera.position.clone().sub(orbit.target).normalize();
  const { target, position } = framing(camera, box, direction);

  return {
    start: performance.now(),
    fromTarget: orbit.target.clone(),
    toTarget: target,
    fromPos: camera.position.clone(),
    toPos: position,
  };
}
