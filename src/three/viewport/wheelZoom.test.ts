import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { listenToWheel, zoomCamera, type CameraRig } from './wheel';

afterEach(() => vi.restoreAllMocks());

function fixture() {
  const camera = new THREE.PerspectiveCamera();
  const target = new THREE.Vector3(2, -3, 4);
  const update = vi.fn();
  const rig = { camera, orbit: { target, update } } as unknown as CameraRig;

  camera.position.set(100, 200, -300);

  return { camera, target, update, rig };
}

function previousZoom(rig: CameraRig, factor: number, limits: { minDistance: number; maxDistance: number }) {
  const offset = rig.camera.position.clone().sub(rig.orbit.target).multiplyScalar(factor);
  const distance = offset.length();
  const accepted = !(distance < limits.minDistance || distance > limits.maxDistance);

  return { position: accepted ? rig.orbit.target.clone().add(offset) : rig.camera.position.clone(), accepted };
}

it('preserves exact zoom motion, limit boundaries and independent targets without cloning vectors', () => {
  const fixtures = [fixture(), fixture()];
  const limits = { minDistance: 1, maxDistance: 10000 };
  const factors = [1, 0.5, 2, 0, -1, 1e-300, 1e300, Infinity, Number.NaN];
  let clones = 0;

  for (let frame = 0; frame < 300; frame++) {
    for (const [index, current] of fixtures.entries()) {
      current.target.set(frame / 17, index - frame / 23, -frame / 31);
      current.camera.position.set(100 + frame, -200 + index, 300 - frame);

      if (frame % 19 === 0) current.camera.position.copy(current.target).addScalar(frame % 2);

      const factor = factors[frame % factors.length];
      const expected = previousZoom(current.rig, factor, limits);
      const target = current.target.toArray();
      const clone = vi.spyOn(THREE.Vector3.prototype, 'clone');

      current.update.mockClear();
      zoomCamera(current.rig, factor, limits);
      clones += clone.mock.calls.length;
      clone.mockRestore();
      expect(current.camera.position.toArray()).toEqual(expected.position.toArray());
      expect(current.target.toArray()).toEqual(target);
      expect(current.update).toHaveBeenCalledTimes(Number(expected.accepted));
    }
  }

  expect(clones).toBe(0);

  for (const distance of [0.999, 1, 10000, 10000.001]) {
    const current = fixture();

    current.camera.position.copy(current.target).add(new THREE.Vector3(distance, 0, 0));

    const expected = previousZoom(current.rig, 1, limits);

    zoomCamera(current.rig, 1, limits);
    expect(current.camera.position.toArray()).toEqual(expected.position.toArray());
    expect(current.update).toHaveBeenCalledTimes(Number(expected.accepted));
  }
});

it.each(['ctrlKey', 'metaKey', 'zoomScroll'])('preserves %s wheel zoom and listener cleanup', (gesture) => {
  const current = fixture();
  const canvas = new EventTarget() as unknown as HTMLElement;
  const options = { minDistance: 1, maxDistance: 10000, panScroll: false, zoomScroll: gesture === 'zoomScroll' };
  const stop = listenToWheel(current.rig, canvas, () => options);

  for (const deltaY of [0, -1, 1, -300, 300, -10000, 10000]) {
    const event = Object.assign(new Event('wheel', { cancelable: true }), {
      deltaY,
      [gesture]: true,
    });
    const exponent = gesture === 'zoomScroll' ? Math.max(-200, Math.min(200, deltaY)) * 0.0015 : deltaY * 0.0085;
    const expected = previousZoom(current.rig, Math.exp(exponent), options);

    current.update.mockClear();
    canvas.dispatchEvent(event);
    expect(current.camera.position.toArray()).toEqual(expected.position.toArray());
    expect(current.update).toHaveBeenCalledTimes(Number(expected.accepted));
    expect(event.defaultPrevented).toBe(true);
  }

  stop();
  current.update.mockClear();
  canvas.dispatchEvent(new Event('wheel'));
  expect(current.update).not.toHaveBeenCalled();
});
