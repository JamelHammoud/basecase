import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { RenderLoop } from './renderLoop';
import type { Stage } from './stage';

function fixture() {
  const stage = {
    camera: new THREE.PerspectiveCamera(42, 1.5, 1, 100000),
    orbit: { target: new THREE.Vector3() },
    renderer: { shadowMap: {}, render: vi.fn() },
    scene: new THREE.Scene(),
    grid: { update: vi.fn() },
    keyLight: new THREE.DirectionalLight(),
    fillLight: new THREE.DirectionalLight(),
  } as unknown as Stage;

  return { stage, loop: new RenderLoop(stage, () => undefined) };
}

it.each([300, 600])('follows camera lighting exactly without vector clones across %i redraws', (count) => {
  const views = [fixture(), fixture()];
  const clone = vi.spyOn(THREE.Vector3.prototype, 'clone');

  try {
    for (let frame = 0; frame < count; frame++) {
      for (const [index, { stage, loop }] of views.entries()) {
        const { camera, orbit, keyLight, fillLight } = stage;

        camera.position.set(frame * 0.7, 100 + index * 200, -frame * 1.3);
        camera.up.set(0.2 + index, 0.7, -0.3);
        orbit.target.set(-frame, index * 15, frame * 2);

        const up = camera.up.toArray();
        const target = orbit.target.toArray();
        const distance = camera.position.distanceTo(orbit.target);
        const expectedFill = new THREE.Vector3()
          .copy(camera.up)
          .multiplyScalar(distance * 0.35)
          .add(camera.position);
        const half = Math.min(4000, Math.max(180, distance * 0.9));

        loop.renderNow();
        expect(fillLight.position.toArray()).toEqual(expectedFill.toArray());
        expect(fillLight.target.position.toArray()).toEqual(target);
        expect(keyLight.position.toArray()).toEqual([
          orbit.target.x + half * 0.78,
          half * 1.45,
          orbit.target.z + half * 0.9,
        ]);
        expect(camera.up.toArray()).toEqual(up);
        expect(orbit.target.toArray()).toEqual(target);
        expect(stage.renderer.shadowMap.needsUpdate).toBe(true);
        loop.renderNow();
        expect(stage.renderer.shadowMap.needsUpdate).toBe(false);
      }
    }

    expect(clone).not.toHaveBeenCalled();

    for (const { stage } of views) expect(stage.renderer.render).toHaveBeenCalledTimes(count * 2);
  } finally {
    clone.mockRestore();
  }
});

it('keeps interaction, following, shadow span and invalidation behavior', () => {
  const { stage, loop } = fixture();
  const { camera, keyLight } = stage;
  const clock = vi.spyOn(performance, 'now').mockReturnValue(1000);

  try {
    camera.position.set(0, 0, 800);
    loop.renderNow();

    const position = keyLight.position.toArray();
    const span = keyLight.shadow.camera.right;

    loop.noteInteraction();
    camera.position.z = 2000;
    loop.renderNow();
    expect(keyLight.position.toArray()).toEqual(position);
    expect(keyLight.shadow.camera.right).toBe(span);
    expect(stage.renderer.shadowMap.needsUpdate).toBe(false);
    loop.following = true;
    loop.renderNow();
    expect(keyLight.position.toArray()).not.toEqual(position);
    expect(keyLight.shadow.camera.right).toBe(1800);
    expect(stage.renderer.shadowMap.needsUpdate).toBe(true);
    loop.following = false;
    camera.position.z = 3000;
    clock.mockReturnValue(1300);
    loop.renderNow();
    expect(keyLight.shadow.camera.right).toBe(2700);
    expect(stage.renderer.shadowMap.needsUpdate).toBe(true);
    keyLight.shadow.camera.right = 1;
    loop.renderNow();
    expect(keyLight.shadow.camera.right).toBe(2700);
    expect(stage.renderer.shadowMap.needsUpdate).toBe(true);
    loop.renderNow();
    expect(stage.renderer.shadowMap.needsUpdate).toBe(false);
    loop.invalidate();
    loop.renderNow();
    expect(stage.renderer.shadowMap.needsUpdate).toBe(true);
  } finally {
    clock.mockRestore();
  }
});
