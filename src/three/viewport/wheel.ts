import * as THREE from 'three';
import type { Stage } from './stage';
import { MAX_DIST, MAX_POLAR, MIN_DIST, MIN_POLAR, type ViewportProps } from './types';

const ZOOM_SPEED = 0.0085;
const ROTATE_SPEED = 0.0055;
const WHEEL_ZOOM_SPEED = 0.0015;
const WHEEL_STEP_CAP = 200;

export type CameraRig = Pick<Stage, 'camera' | 'orbit'>;

export interface WheelOptions {
  minDistance: number;
  maxDistance: number;
  panScroll: boolean;
  zoomScroll?: boolean;
}

const VIEWPORT_LIMITS = { minDistance: MIN_DIST, maxDistance: MAX_DIST };

export function zoomCamera(stage: CameraRig, factor: number, limits = VIEWPORT_LIMITS): void {
  const { camera, orbit } = stage;
  const x = (camera.position.x - orbit.target.x) * factor;
  const y = (camera.position.y - orbit.target.y) * factor;
  const z = (camera.position.z - orbit.target.z) * factor;
  const distance = Math.sqrt(x * x + y * y + z * z);

  if (distance < limits.minDistance || distance > limits.maxDistance) {
    return;
  }

  camera.position.set(orbit.target.x + x, orbit.target.y + y, orbit.target.z + z);
  orbit.update();
}

function pan(stage: CameraRig, e: WheelEvent): void {
  const { camera, orbit } = stage;
  const scale = camera.position.distanceTo(orbit.target) * 0.0016;
  const horizontal = e.deltaX * scale;
  const vertical = -e.deltaY * scale;
  const basis = camera.matrix.elements;
  const singular = camera.matrix.determinantAffine() === 0;
  const x = singular ? horizontal : basis[0] * horizontal + basis[4] * vertical;
  const y = singular ? vertical : basis[1] * horizontal + basis[5] * vertical;
  const z = singular ? 0 : basis[2] * horizontal + basis[6] * vertical;

  camera.position.set(camera.position.x + x, camera.position.y + y, camera.position.z + z);
  orbit.target.set(orbit.target.x + x, orbit.target.y + y, orbit.target.z + z);
  orbit.update();
}

interface OrbitWorkspace {
  offset: THREE.Vector3;
  spherical: THREE.Spherical;
}

function orbitBy(stage: CameraRig, e: WheelEvent, workspace: OrbitWorkspace): void {
  const { camera, orbit } = stage;
  const { offset, spherical } = workspace;

  offset.copy(camera.position).sub(orbit.target);
  spherical.setFromVector3(offset);

  spherical.theta -= e.deltaX * ROTATE_SPEED;
  spherical.phi = Math.max(MIN_POLAR, Math.min(MAX_POLAR, spherical.phi - e.deltaY * ROTATE_SPEED));
  spherical.makeSafe();
  offset.setFromSpherical(spherical);
  camera.position.copy(orbit.target).add(offset);
  orbit.update();
}

export function listenToWheel(rig: CameraRig, canvas: HTMLElement, options: () => WheelOptions): () => void {
  const orbitWorkspace = { offset: new THREE.Vector3(), spherical: new THREE.Spherical() };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();

    if (e.ctrlKey || e.metaKey) {
      zoomCamera(rig, Math.exp(e.deltaY * ZOOM_SPEED), options());

      return;
    }

    const scroll = options();

    if (scroll.zoomScroll && !e.shiftKey) {
      const step = Math.max(-WHEEL_STEP_CAP, Math.min(WHEEL_STEP_CAP, e.deltaY));

      zoomCamera(rig, Math.exp(step * WHEEL_ZOOM_SPEED), scroll);

      return;
    }

    if (e.shiftKey || scroll.panScroll) pan(rig, e);
    else orbitBy(rig, e, orbitWorkspace);
  };

  canvas.addEventListener('wheel', onWheel, { passive: false });

  return () => canvas.removeEventListener('wheel', onWheel);
}

export const installWheel = (stage: Stage, props: () => ViewportProps) =>
  listenToWheel(stage, stage.renderer.domElement, () => ({
    ...VIEWPORT_LIMITS,
    panScroll: props().trackpadMode === 'pan-scroll',
    zoomScroll: props().trackpadMode === 'zoom-scroll',
  }));
