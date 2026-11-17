import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { listenToWheel, type CameraRig } from './wheel';

afterEach(() => vi.restoreAllMocks());

function fixture(panScroll: boolean) {
  const camera = new THREE.PerspectiveCamera();
  const target = new THREE.Vector3(2, -3, 4);
  const update = vi.fn();
  const rig = { camera, orbit: { target, update } } as unknown as CameraRig;
  const canvas = new EventTarget() as unknown as HTMLElement;
  const stop = listenToWheel(rig, canvas, () => ({ minDistance: 1, maxDistance: 10000, panScroll }));

  camera.position.set(100, 200, -300);

  return { camera, target, update, canvas, stop };
}

function previousOffset(camera: THREE.PerspectiveCamera, target: THREE.Vector3, event: WheelEvent) {
  const scale = camera.position.distanceTo(target) * 0.0016;
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();

  camera.matrix.extractBasis(right, up, new THREE.Vector3());

  return new THREE.Vector3().addScaledVector(right, event.deltaX * scale).addScaledVector(up, -event.deltaY * scale);
}

it.each([300, 600])('preserves exact pan motion across %i events in independent viewports', (count) => {
  const fixtures = [fixture(true), fixture(false)];

  for (let frame = 0; frame < count; frame++) {
    for (const [index, current] of fixtures.entries()) {
      const { camera, target, canvas, update } = current;
      const event = Object.assign(new Event('wheel', { cancelable: true }), {
        deltaX: frame % 7 === 0 ? 0 : Math.sin(frame) * 100,
        deltaY: frame % 11 === 0 ? 0 : Math.cos(frame) * 100,
        shiftKey: index === 1,
        ctrlKey: false,
        metaKey: false,
      }) as WheelEvent;

      camera.rotation.set(frame / 19, -frame / 23, index + frame / 31);
      camera.scale.set(1 + index, 0.5 + (frame % 3), frame % 13 === 0 ? 0 : 2);
      camera.updateMatrix();

      const matrix = camera.matrix.elements.slice();
      const offset = previousOffset(camera, target, event);
      const expectedCamera = camera.position.clone().add(offset);
      const expectedTarget = target.clone().add(offset);
      const basisReads = vi.spyOn(camera.matrix, 'extractBasis');

      canvas.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(camera.position.toArray()).toEqual(expectedCamera.toArray());
      expect(target.toArray()).toEqual(expectedTarget.toArray());
      expect(camera.matrix.elements).toEqual(matrix);
      expect(update).toHaveBeenCalledTimes(frame + 1);
      expect(basisReads).not.toHaveBeenCalled();
      basisReads.mockRestore();
    }
  }

  for (const current of fixtures) {
    current.stop();
    current.canvas.dispatchEvent(new Event('wheel'));
    expect(current.update).toHaveBeenCalledTimes(count);
  }
});

function previousOrbit(camera: THREE.PerspectiveCamera, target: THREE.Vector3, event: WheelEvent) {
  const offset = camera.position.clone().sub(target);
  const spherical = new THREE.Spherical().setFromVector3(offset);

  spherical.theta -= event.deltaX * 0.0055;
  spherical.phi = Math.max(0.08, Math.min(Math.PI - 0.08, spherical.phi - event.deltaY * 0.0055));
  spherical.makeSafe();
  offset.setFromSpherical(spherical);

  return target.clone().add(offset);
}

it.each([300, 600])('reuses independent orbit workspaces across %i events without changing motion', (count) => {
  const fixtures = [fixture(false), fixture(false)];
  const workspaces = new Set<unknown>();
  const offsets = new Set<THREE.Vector3>();
  const sample = vi.spyOn(THREE.Spherical.prototype, 'setFromVector3');

  for (let frame = 0; frame < count; frame++) {
    for (const [index, current] of fixtures.entries()) {
      const { camera, target, canvas, update } = current;
      const event = Object.assign(new Event('wheel', { cancelable: true }), {
        deltaX: frame % 7 === 0 ? 0 : Math.sin(frame) * 100,
        deltaY: frame % 11 === 0 ? Math.cos(frame) * 10000 : Math.cos(frame) * 100,
      }) as WheelEvent;

      target.set(index + frame / 17, -frame / 23, index - frame / 31);

      if (frame % 19 === 0) camera.position.copy(target);
      else camera.position.addScalar(index + 1);

      const beforeTarget = target.toArray();
      const expected = previousOrbit(camera, target, event);

      sample.mockClear();
      canvas.dispatchEvent(event);
      expect(sample).toHaveBeenCalledTimes(1);
      workspaces.add(sample.mock.contexts[0]);
      offsets.add(sample.mock.calls[0][0]);
      expect(camera.position.toArray()).toEqual(expected.toArray());
      expect(target.toArray()).toEqual(beforeTarget);
      expect(event.defaultPrevented).toBe(true);
      expect(update).toHaveBeenCalledTimes(frame + 1);
    }
  }

  expect(workspaces.size).toBe(2);
  expect(offsets.size).toBe(2);

  for (const current of fixtures) {
    current.stop();
    current.canvas.dispatchEvent(new Event('wheel'));
    expect(current.update).toHaveBeenCalledTimes(count);
  }
});
