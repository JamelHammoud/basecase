import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { RenderLoop } from './renderLoop';
import type { Stage } from './stage';

function fixture() {
  const camera = new THREE.PerspectiveCamera(42, 1.5, 1, 100000);
  const target = new THREE.Vector3();
  const render = vi.fn();
  const stage = {
    camera,
    orbit: { target },
    renderer: { shadowMap: {}, render },
    scene: new THREE.Scene(),
    grid: { update: vi.fn() },
    keyLight: new THREE.DirectionalLight(),
    fillLight: new THREE.DirectionalLight(),
  } as unknown as Stage;
  const loop = new RenderLoop(stage, () => undefined);
  const update = vi.spyOn(camera, 'updateProjectionMatrix');

  return { camera, target, render, loop, update };
}

function expectProjection(camera: THREE.PerspectiveCamera) {
  const expected = camera.clone();

  expected.updateProjectionMatrix();
  expect(camera.projectionMatrix.elements).toEqual(expected.projectionMatrix.elements);
  expect(camera.projectionMatrixInverse.elements).toEqual(expected.projectionMatrixInverse.elements);
}

it('retains projection across redraws, equal-distance moves and clamped near planes', () => {
  const { camera, target, render, loop, update } = fixture();

  camera.position.set(0, 0, 800);
  loop.renderNow();
  expect(camera.near).toBe(2);
  expect(update).toHaveBeenCalledTimes(1);

  for (let frame = 0; frame < 600; frame++) {
    camera.position.set(frame, 800, 0);
    target.set(frame, 0, 0);
    loop.renderNow();
  }

  expect(update).toHaveBeenCalledTimes(1);
  expect(render).toHaveBeenCalledTimes(601);
  expectProjection(camera);
  camera.position.copy(target).add(new THREE.Vector3(0, 0, 100));
  loop.renderNow();
  expect(camera.near).toBe(0.5);
  expect(update).toHaveBeenCalledTimes(2);
  camera.position.copy(target).add(new THREE.Vector3(0, 0, 50));
  loop.renderNow();
  expect(update).toHaveBeenCalledTimes(2);
  expectProjection(camera);
});

it('keeps external projection updates and independent viewport cameras current', () => {
  const first = fixture();
  const second = fixture();

  first.camera.position.z = 800;
  second.camera.position.z = 1600;
  first.loop.renderNow();
  second.loop.renderNow();
  expect(first.camera.near).toBe(2);
  expect(second.camera.near).toBe(4);
  first.camera.aspect = 2;
  first.camera.fov = 60;
  first.camera.updateProjectionMatrix();
  first.loop.renderNow();
  expect(first.update).toHaveBeenCalledTimes(2);
  expectProjection(first.camera);
  first.camera.near = 20;
  first.camera.updateProjectionMatrix();
  first.loop.renderNow();
  expect(first.camera.near).toBe(2);
  expectProjection(first.camera);
  second.camera.position.z = 2400;
  second.loop.renderNow();
  expect(second.camera.near).toBe(6);
  expect(second.update).toHaveBeenCalledTimes(2);
  expectProjection(second.camera);
});
