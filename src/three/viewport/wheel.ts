import * as THREE from 'three';
import type { Stage } from './stage';
import { MAX_DIST, MAX_POLAR, MIN_DIST, MIN_POLAR, type ViewportProps } from './types';

const ZOOM_SPEED = 0.0085;
const ROTATE_SPEED = 0.0055;

export type CameraRig = Pick<Stage, 'camera' | 'orbit'>;

export interface WheelOptions {
  minDistance: number;
  maxDistance: number;
  panScroll: boolean;
}

const VIEWPORT_LIMITS = { minDistance: MIN_DIST, maxDistance: MAX_DIST };

export function zoomCamera(stage: CameraRig, factor: number, limits = VIEWPORT_LIMITS): void {
  const { camera, orbit } = stage;
  const offset = camera.position.clone().sub(orbit.target).multiplyScalar(factor);
  const distance = offset.length();

  if (distance < limits.minDistance || distance > limits.maxDistance) {
    return;
  }

  camera.position.copy(orbit.target).add(offset);
  orbit.update();
}

function pan(stage: CameraRig, e: WheelEvent): void {
  const { camera, orbit } = stage;
  const scale = camera.position.distanceTo(orbit.target) * 0.0016;
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();

  camera.matrix.extractBasis(right, up, new THREE.Vector3());

  const offset = new THREE.Vector3().addScaledVector(right, e.deltaX * scale).addScaledVector(up, -e.deltaY * scale);

  camera.position.add(offset);
  orbit.target.add(offset);
  orbit.update();
}

function orbitBy(stage: CameraRig, e: WheelEvent): void {
  const { camera, orbit } = stage;
  const offset = camera.position.clone().sub(orbit.target);
  const spherical = new THREE.Spherical().setFromVector3(offset);

  spherical.theta -= e.deltaX * ROTATE_SPEED;
  spherical.phi = Math.max(MIN_POLAR, Math.min(MAX_POLAR, spherical.phi - e.deltaY * ROTATE_SPEED));
  spherical.makeSafe();
  offset.setFromSpherical(spherical);
  camera.position.copy(orbit.target).add(offset);
  orbit.update();
}

export function listenToWheel(rig: CameraRig, canvas: HTMLElement, options: () => WheelOptions): () => void {
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();

    if (e.ctrlKey || e.metaKey) {
      zoomCamera(rig, Math.exp(e.deltaY * ZOOM_SPEED), options());

      return;
    }

    if (e.shiftKey || options().panScroll) pan(rig, e);
    else orbitBy(rig, e);
  };

  canvas.addEventListener('wheel', onWheel, { passive: false });

  return () => canvas.removeEventListener('wheel', onWheel);
}

export const installWheel = (stage: Stage, props: () => ViewportProps) =>
  listenToWheel(stage, stage.renderer.domElement, () => ({
    ...VIEWPORT_LIMITS,
    panScroll: props().trackpadMode === 'pan-scroll',
  }));
