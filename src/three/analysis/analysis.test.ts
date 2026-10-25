import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { interferenceIn, sweepsIn } from './analysisPool';
import { snapshotShapes } from './sceneShapes';

const box = (id: string, x: number, size = 20) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size));

  mesh.position.set(x, 0, 0);

  return { id, object: mesh };
};

const OPTIONS = { toleranceMm: 0.3, maxSamples: 400 };

const interferences = async (objects: ReturnType<typeof box>[], focus?: string[]) =>
  (await interferenceIn(snapshotShapes(objects), { ...OPTIONS, focus })).interferences;

describe('interference in the analysis workers', () => {
  it('reports the depth of two overlapping boxes', async () => {
    expect(await interferences([box('a', 0), box('b', 15)])).toEqual([{ a: 'a', b: 'b', depthMm: 5, fraction: 0.04 }]);
  });

  it('reports nothing for two touching boxes', async () => {
    expect(await interferences([box('a', 0), box('b', 20)])).toEqual([]);
  });

  it('ignores pairs away from the focused parts', async () => {
    expect(await interferences([box('a', 0), box('b', 15), box('c', 200)], ['c'])).toEqual([]);
  });

  it('reuses one shape for identical parts and measures them in their own frames', async () => {
    const geometry = new THREE.BoxGeometry(20, 20, 20);
    const group = (id: string, x: number, turn: number) => {
      const root = new THREE.Group();
      const mesh = new THREE.Mesh(geometry);

      mesh.position.set(0, 10, 0);
      root.add(mesh);
      root.position.set(x, 0, 0);
      root.rotation.y = turn;

      return { id, object: root };
    };
    const scene = snapshotShapes([group('a', 0, 0), group('b', 15, Math.PI / 2)]);

    expect(scene.shapes.size).toBe(1);
    expect((await interferenceIn(scene, OPTIONS)).interferences).toEqual([
      { a: 'a', b: 'b', depthMm: 5, fraction: 0.04 },
    ]);
  });

  it('reports flush faces as coplanar', async () => {
    const { coplanar } = await interferenceIn(snapshotShapes([box('a', 0), box('b', 20)]), OPTIONS);

    expect(coplanar).toEqual([{ a: 'a', b: 'b', areaMm2: 400 }]);
  });
});

describe('range-of-motion sweeps', () => {
  const arm = () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(10, 100, 10));

    mesh.position.set(0, 100, 0);

    return { id: 'arm', object: mesh };
  };
  const wall = () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(60, 40, 40));

    mesh.position.set(80, 50, 0);

    return { id: 'wall', object: mesh };
  };

  it('finds the angle where a moving link meets another part, and the floor', async () => {
    const scene = snapshotShapes([arm(), wall()]);
    const [toWall, toFloor] = await sweepsIn(scene, [
      { moving: ['arm'], origin: [0, 50, 0], axis: [0, 0, 1], anglesDeg: [-90, -45] },
      { moving: ['arm'], origin: [0, 50, 0], axis: [0, 0, 1], anglesDeg: [180] },
    ]);

    expect(toWall.map((h) => [h.a, h.b, h.angle])).toEqual([['arm', 'wall', -90]]);
    expect(toFloor).toEqual([{ a: 'arm', b: 'floor', depthMm: 50, angle: 180 }]);
  });

  it('leaves pairs that already overlap at rest out of the sweep', async () => {
    const touching = { ...wall() };

    touching.object.position.set(30, 100, 0);

    const [hits] = await sweepsIn(snapshotShapes([arm(), touching]), [
      { moving: ['arm'], origin: [0, 50, 0], axis: [0, 0, 1], anglesDeg: [10] },
    ]);

    expect(hits).toEqual([]);
  });
});
