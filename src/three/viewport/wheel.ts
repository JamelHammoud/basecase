import * as THREE from 'three';
import type { Stage } from './stage';
import { MAX_DIST, MIN_DIST, type ViewportProps } from './types';

const ZOOM_SPEED = 0.0085;
const ROTATE_SPEED = 0.0055;

export function zoomCamera(stage: Stage, factor: number): void {
  const { camera, orbit } = stage;
  const offset = camera.position.clone().sub(orbit.target).multiplyScalar(factor);
  const distance = offset.length();

  if (distance < MIN_DIST || distance > MAX_DIST) {
    return;
  }

  camera.position.copy(orbit.target).add(offset);
  orbit.update();
}

function pan(stage: Stage, e: WheelEvent): void {
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

function orbitBy(stage: Stage, e: WheelEvent): void {
  const { camera, orbit } = stage;
  const offset = camera.position.clone().sub(orbit.target);
  const spherical = new THREE.Spherical().setFromVector3(offset);

  spherical.theta -= e.deltaX * ROTATE_SPEED;
  spherical.phi = Math.max(0.08, Math.min(Math.PI * 0.49, spherical.phi - e.deltaY * ROTATE_SPEED));
  spherical.makeSafe();
  offset.setFromSpherical(spherical);
  camera.position.copy(orbit.target).add(offset);
  orbit.update();
}

export function installWheel(stage: Stage, props: () => ViewportProps): () => void {
  const canvas = stage.renderer.domElement;
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();

    if (e.ctrlKey || e.metaKey) {
      zoomCamera(stage, Math.exp(e.deltaY * ZOOM_SPEED));

      return;
    }

    if (e.shiftKey || props().trackpadMode === 'pan-scroll') pan(stage, e);
    else orbitBy(stage, e);
  };

  canvas.addEventListener('wheel', onWheel, { passive: false });

  return () => canvas.removeEventListener('wheel', onWheel);
}
