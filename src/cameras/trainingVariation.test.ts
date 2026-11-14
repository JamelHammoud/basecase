import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Posed } from '../datasets/renderVideos';
import { varyTrainingScene, varyTrainingShot } from './trainingVariation';
import type { LensShot } from './lensRender';

const item = (): Posed => {
  const group = new THREE.Group();

  group.position.set(100, 200, 300);
  group.add(new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshStandardMaterial({ color: 'red' })));
  group.updateMatrixWorld(true);

  return { id: 'box', group, position: group.position.clone(), quaternion: group.quaternion.clone() };
};

const shot: LensShot = {
  position: [0, 100, 1000],
  target: [0, 0, 0],
  up: [0, 1, 0],
  lens: { model: 'pinhole', hfovDeg: 90 },
};

describe('training variation', () => {
  it('repeats a seed and restores all scene and material state after capture', () => {
    const part = item();
    const scene = new THREE.Scene();
    const original = (part.group.children[0] as THREE.Mesh).material;
    const options = {
      objects: { box: { mm: 10, deg: 20, colors: [{ name: 'ripe', color: '#ff0000' }] } },
      textures: 1,
      lighting: 1,
    };

    const light = new THREE.DirectionalLight(0xffffff, 2);
    const lightColor = light.color.clone();

    scene.add(part.group, light);

    const first = varyTrainingScene({ scene, items: [part], seed: 42, randomization: options });
    const position = part.group.position.clone();
    const quaternion = part.group.quaternion.clone();

    expect(first.variants).toEqual({ box: 'ripe' });
    expect(light.color.toArray()).not.toEqual(lightColor.toArray());
    expect(light.intensity).not.toBe(2);
    expect(position).not.toEqual(part.position);
    first.restore();
    expect(light.color.toArray()).toEqual(lightColor.toArray());
    expect(light.intensity).toBe(2);
    expect(part.group.position).toEqual(part.position);
    expect((part.group.children[0] as THREE.Mesh).material).toBe(original);

    const second = varyTrainingScene({ scene, items: [part], seed: 42, randomization: options });

    expect(part.group.position).toEqual(position);
    expect(part.group.quaternion.toArray()).toEqual(quaternion.toArray());
    second.restore();
  });

  it('uses declared placements for object points and visibility', () => {
    const part = item();
    const scene = new THREE.Scene();

    scene.add(part.group);

    const result = varyTrainingScene({
      scene,
      items: [part],
      seed: 1,
      randomization: { objects: { box: { position: [400, 200, 300], rotation: [0, 90, 0], visible: false } } },
    });
    const moved = new THREE.Vector3(100, 200, 300).applyMatrix4(result.deltas.get('box')!);

    expect(moved.toArray()).toEqual([400, 200, 300]);
    expect(part.group.visible).toBe(false);
    result.restore();
    expect(part.group.visible).toBe(true);
  });

  it('composes authored placement with the current simulation pose', () => {
    const part = item();
    const scene = new THREE.Scene();

    scene.add(part.group);
    part.group.position.x += 50;
    part.group.updateMatrixWorld(true);

    const result = varyTrainingScene({
      scene,
      items: [part],
      seed: 1,
      randomization: { objects: { box: { position: [400, 200, 300] } } },
    });
    const moved = new THREE.Vector3(100, 200, 300).applyMatrix4(result.deltas.get('box')!);

    expect(moved.toArray()).toEqual([450, 200, 300]);
    expect(part.group.position.x).toBe(450);
    result.restore();
    expect(part.group.position.x).toBe(150);
  });

  it('keeps named variants for ids that match prototype property names', () => {
    const part = { ...item(), id: '__proto__' };
    const scene = new THREE.Scene();
    const objects = Object.fromEntries([['__proto__', { colors: [{ name: 'ripe', color: 'red' }] }]]);

    scene.add(part.group);

    const result = varyTrainingScene({ scene, items: [part], seed: 1, randomization: { objects } });

    expect(Object.hasOwn(result.variants, '__proto__')).toBe(true);
    expect(result.variants['__proto__']).toBe('ripe');
    result.restore();
  });

  it('keeps camera tolerance and lens jitter deterministic and leaves the source unchanged', () => {
    const randomization = { cameraPositionMm: 10, cameraRotationDeg: 5, lensDeg: 2 };
    const first = varyTrainingShot(shot, 42, randomization);

    expect(first).toEqual(varyTrainingShot(shot, 42, randomization));
    expect(first).not.toEqual(varyTrainingShot(shot, 43, randomization));
    expect(shot.position).toEqual([0, 100, 1000]);
    expect(first.lens.model === 'pinhole' && first.lens.hfovDeg).toBeGreaterThanOrEqual(88);
    expect(first.lens.model === 'pinhole' && first.lens.hfovDeg).toBeLessThanOrEqual(92);
  });
});
