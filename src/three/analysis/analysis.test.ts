import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { floorIn, interferenceIn, sweepsIn } from './analysisPool';
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

  it('reports surfaces that lie in one plane and face the same way', async () => {
    const lid = new THREE.Mesh(new THREE.BoxGeometry(20, 10, 20));
    const body = new THREE.Mesh(new THREE.BoxGeometry(60, 10, 60));
    const { coplanar } = await interferenceIn(
      snapshotShapes([
        { id: 'lid', object: lid },
        { id: 'body', object: body },
      ]),
      OPTIONS,
    );

    expect(coplanar).toHaveLength(1);
    expect(coplanar[0].areaMm2).toBe(800);
  });

  it('leaves two parts that only rest face to face alone', async () => {
    const { coplanar, interferences } = await interferenceIn(snapshotShapes([box('a', 0), box('b', 20)]), OPTIONS);

    expect({ coplanar, interferences }).toEqual({ coplanar: [], interferences: [] });
  });

  it('finds coincident surface on coarse faces that overlap away from their centres', async () => {
    const shifted = new THREE.Mesh(new THREE.BoxGeometry(300, 10, 300));

    shifted.position.set(290, 0, 290);

    const plain = new THREE.Mesh(new THREE.BoxGeometry(300, 10, 300));
    const { coplanar } = await interferenceIn(
      snapshotShapes([
        { id: 'a', object: plain },
        { id: 'b', object: shifted },
      ]),
      OPTIONS,
    );

    expect(coplanar).toHaveLength(1);
    expect(coplanar[0].areaMm2).toBeGreaterThan(100);
  });
});

describe('parts that pass through each other with no vertex inside', () => {
  const part = (id: string, size: [number, number, number], at: [number, number, number] = [0, 0, 0]) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size));

    mesh.position.set(...at);

    return { id, object: mesh };
  };
  const rod = () => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 200, 32));

    return { id: 'rod', object: mesh };
  };
  const clash = async (objects: Array<{ id: string; object: THREE.Object3D }>) =>
    (await interferenceIn(snapshotShapes(objects), OPTIONS)).interferences;

  it('catches two bars crossed like a plus', async () => {
    const [hit] = await clash([part('a', [200, 10, 10]), part('b', [10, 200, 10])]);

    expect(hit.depthMm).toBeGreaterThan(1);
  });

  it('catches a rod through an uncut plate', async () => {
    const [hit] = await clash([rod(), part('plate', [100, 5, 100])]);

    expect(hit.depthMm).toBeGreaterThan(1);
  });

  it('catches a beam through a thin wall', async () => {
    const [hit] = await clash([part('beam', [20, 20, 200]), part('wall', [100, 100, 6])]);

    expect(hit.depthMm).toBeGreaterThan(1);
  });

  it('catches dense plates that overlap only at one corner', async () => {
    const dense = (id: string, at: [number, number, number]) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(300, 10, 300, 60, 2, 60));

      mesh.position.set(...at);

      return { id, object: mesh };
    };

    expect(await clash([dense('a', [0, 0, 0]), dense('b', [291.3, 0, 291.7])])).toHaveLength(1);
  });

  it('leaves a rod alone in a hole it fits, even when the facets differ', async () => {
    const shell = new THREE.Shape();

    shell.absarc(0, 0, 50, 0, Math.PI * 2, false);

    const hole = new THREE.Path();

    hole.absarc(0, 0, 4, 0, Math.PI * 2, true);
    shell.holes.push(hole);

    const plate = new THREE.ExtrudeGeometry(shell, { depth: 5, bevelEnabled: false, curveSegments: 48 }).rotateX(
      Math.PI / 2,
    );

    expect(await clash([rod(), { id: 'plate', object: new THREE.Mesh(plate) }])).toEqual([]);
  });
});

describe('the lowest point of a posed robot', () => {
  const TIRE_RADIUS = 70;
  const tire = (id: string, centerHeight: number, spin: number) => {
    const geometry = new THREE.CylinderGeometry(TIRE_RADIUS, TIRE_RADIUS, 30, 96).rotateX(Math.PI / 2);
    const mesh = new THREE.Mesh(geometry);

    mesh.position.set(0, centerHeight, 0);
    mesh.rotation.z = spin;

    return { id, object: mesh };
  };

  it('stays on the floor however far a resting tire has spun', async () => {
    for (const spin of [0, Math.PI / 8, Math.PI / 4, 1]) {
      const floor = await floorIn(snapshotShapes([tire('tire', TIRE_RADIUS, spin)]));

      expect(Math.abs(floor!)).toBeLessThan(0.1);
    }
  });

  it('still reports a spun tire that really is 20 mm under the floor', async () => {
    const floor = await floorIn(snapshotShapes([tire('tire', TIRE_RADIUS - 20, Math.PI / 4)]));

    expect(floor).toBeCloseTo(-20, 0);
  });

  it('takes the lowest of several parts, whatever their order', async () => {
    const floor = await floorIn(snapshotShapes([tire('high', 500, 0.3), tire('low', 100, 0.3), tire('mid', 300, 0.3)]));

    expect(floor).toBeCloseTo(100 - TIRE_RADIUS, 0);
  });

  it('has no lowest point without meshes', async () => {
    expect(await floorIn(snapshotShapes([]))).toBeNull();
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

  it('reports a pair that overlaps a little at rest once it gets much deeper', async () => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(20, 200, 20));
    const swinging = new THREE.Mesh(new THREE.BoxGeometry(10, 100, 10));

    post.position.set(14.5, 100, 0);
    swinging.position.set(0, 100, 0);

    const [hits] = await sweepsIn(
      snapshotShapes([
        { id: 'arm', object: swinging },
        { id: 'post', object: post },
      ]),
      [{ moving: ['arm'], origin: [0, 50, 0], axis: [0, 0, 1], anglesDeg: [-30] }],
    );

    expect(hits.filter((h) => h.b === 'post')).toHaveLength(1);
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
