import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { FollowCamera } from './followCamera';
import type { Stage } from './stage';

function fixture() {
  const camera = new THREE.PerspectiveCamera();
  const target = new THREE.Vector3(2, 3, 4);
  const objects = new Map<string, THREE.Object3D>();
  const stage = { camera, orbit: { target } } as unknown as Stage;

  camera.position.set(100, 200, 300);

  return { camera, target, objects, follow: new FollowCamera(stage, (id) => objects.get(id)) };
}

it('preserves world-space catch-up across movement, settling and target changes', () => {
  const { camera, target, objects, follow } = fixture();
  const parent = new THREE.Group();
  const robot = new THREE.Object3D();
  const replacement = new THREE.Object3D();
  const expectedCamera = camera.position.clone();
  const expectedTarget = target.clone();
  const tracked = new THREE.Vector3();

  parent.position.set(25, -40, 12);
  parent.rotation.set(0.3, -0.6, 0.2);
  parent.scale.set(2, 3, 0.5);
  parent.add(robot);
  objects.set('robot', robot);
  follow.follow('robot');
  robot.getWorldPosition(tracked);
  expect(follow.active).toBe(true);

  for (let frame = 0; frame < 600; frame++) {
    if (frame < 300) robot.position.set(frame / 3, Math.sin(frame), -frame / 7);

    if (frame === 400) {
      replacement.position.set(-30, 70, 10);
      objects.set('robot', replacement);
    }

    const object = objects.get('robot')!;
    const position = object.position.clone();
    const now = object.getWorldPosition(new THREE.Vector3());
    const step = now.clone().sub(tracked).multiplyScalar(0.18);
    const moved = step.lengthSq() >= 1e-6;

    if (moved) {
      tracked.add(step);
      expectedCamera.add(step);
      expectedTarget.add(step);
    }

    expect(follow.update()).toBe(moved);
    expect(camera.position.toArray()).toEqual(expectedCamera.toArray());
    expect(target.toArray()).toEqual(expectedTarget.toArray());
    expect(object.position.toArray()).toEqual(position.toArray());
  }

  follow.follow(null);
  expect(follow.active).toBe(false);
  expect(follow.update()).toBe(false);
  objects.delete('robot');
  follow.follow('robot');
  expect(follow.update()).toBe(false);
  objects.set('robot', robot);
  follow.follow('robot');
  expect(follow.update()).toBe(false);
  expect(camera.position.toArray()).toEqual(expectedCamera.toArray());
});

it('reuses one world-position workspace per viewport for moving and stationary updates', () => {
  const first = fixture();
  const second = fixture();
  const robot = new THREE.Object3D();

  first.objects.set('robot', robot);
  second.objects.set('robot', robot);
  first.follow.follow('robot');
  second.follow.follow('robot');

  const positions = vi.spyOn(robot, 'getWorldPosition');
  const clones = vi.spyOn(THREE.Vector3.prototype, 'clone');

  for (let frame = 0; frame < 600; frame++) {
    if (frame < 300) robot.position.x = frame;

    first.follow.update();
    second.follow.update();
  }

  const destinations = positions.mock.calls.map(([destination]) => destination);

  expect(positions).toHaveBeenCalledTimes(1200);
  expect(new Set(destinations).size).toBe(2);
  expect(destinations[0]).not.toBe(destinations[1]);
  expect(clones).not.toHaveBeenCalled();
  positions.mockRestore();
  clones.mockRestore();
  expect(first.camera.position.toArray()).toEqual(second.camera.position.toArray());
});
