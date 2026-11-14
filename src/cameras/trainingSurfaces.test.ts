import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { seeded } from '../utils/seeded';
import { TrainingSurfaces } from './trainingSurfaces';
import { varyTrainingScene } from './trainingVariation';

const mesh = () =>
  new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ color: 'white' }));

describe('training surface textures', () => {
  it('reuses texture resources, repeats a seed, and restores the original surface material', () => {
    const floor = mesh();
    const original = floor.material;
    const pool = new TrainingSurfaces();
    const restore = pool.apply(floor, seeded(42), 1);
    const varied = floor.material;
    const map = varied.map as THREE.DataTexture;
    const pixels = [...(map.image.data ?? [])];

    expect(varied).not.toBe(original);
    expect(pixels.some((value) => value < 255)).toBe(true);
    restore();
    expect(floor.material).toBe(original);

    const secondRestore = pool.apply(floor, seeded(42), 1);

    expect(floor.material).toBe(varied);
    expect(floor.material.map).toBe(map);
    expect([...(map.image.data ?? [])]).toEqual(pixels);
    secondRestore();

    const thirdRestore = pool.apply(floor, seeded(43), 1);

    expect([...(map.image.data ?? [])]).not.toEqual(pixels);
    thirdRestore();
    pool.dispose();
    original.dispose();
    floor.geometry.dispose();
  });

  it('textures declared surfaces while preserving object and robot texture maps', () => {
    const floor = mesh();
    const partMesh = mesh();
    const group = new THREE.Group();
    const scene = new THREE.Scene();
    const map = new THREE.DataTexture(new Uint8Array([255, 0, 0, 255]), 1, 1);
    const original = partMesh.material;

    partMesh.material.map = map;
    group.add(partMesh);
    scene.add(floor, group);

    const result = varyTrainingScene({
      scene,
      items: [{ id: 'object', group, position: group.position.clone(), quaternion: group.quaternion.clone() }],
      surfaces: [floor],
      seed: 42,
      randomization: { textures: 1 },
    });

    expect(floor.material.map).not.toBeNull();
    expect(partMesh.material).toBe(original);
    expect(partMesh.material.map).toBe(map);
    result.restore();
    expect(floor.material.map).toBeNull();
    map.dispose();
    original.dispose();
    floor.material.dispose();
    floor.geometry.dispose();
    partMesh.geometry.dispose();
  });

  it('reuses surface textures when a wall also has a declared color variant', () => {
    const wall = mesh();
    const original = wall.material;
    const group = new THREE.Group();
    const scene = new THREE.Scene();
    const pool = new TrainingSurfaces();

    group.add(wall);
    scene.add(group);

    const job = {
      scene,
      items: [{ id: 'wall', group, position: group.position.clone(), quaternion: group.quaternion.clone() }],
      surfaces: [group],
      surfacePool: pool,
      seed: 42,
      randomization: { textures: 1, objects: { wall: { colors: [{ name: 'green', color: '#00ff00' }] } } },
    };
    const first = varyTrainingScene(job);
    const map = wall.material.map;

    expect(wall.material.color.getHexString()).toBe('00ff00');
    first.restore();
    expect(wall.material).toBe(original);

    const second = varyTrainingScene(job);

    expect(wall.material.map).toBe(map);
    expect(wall.material.color.getHexString()).toBe('00ff00');
    second.restore();
    expect(wall.material).toBe(original);
    pool.dispose();
    original.dispose();
    wall.geometry.dispose();
  });
});
