import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { gapsIn, measuresIn } from './analysisPool';
import { snapshotShapes } from './sceneShapes';

const at = (id: string, geometry: THREE.BufferGeometry, place: (m: THREE.Mesh) => void) => {
  const mesh = new THREE.Mesh(geometry);

  place(mesh);

  return { id, object: mesh };
};

const spanOf = (points: Array<[number, number]>, axis: 0 | 1) =>
  Math.max(...points.map((p) => p[axis])) - Math.min(...points.map((p) => p[axis]));

const baseOf = async (object: ReturnType<typeof at>) => (await measuresIn(snapshotShapes([object])))[object.id].base!;

describe('where a part meets the floor', () => {
  it('gives a ball a contact patch, not its whole footprint', async () => {
    const base = await baseOf(at('ball', new THREE.SphereGeometry(30, 48, 24), (m) => m.position.set(0, 30, 0)));

    expect(spanOf(base, 0)).toBeLessThan(10);
    expect(spanOf(base, 1)).toBeLessThan(10);
  });

  it('gives a spun wheel with no joint a strip across its tread', async () => {
    const tire = new THREE.CylinderGeometry(70, 70, 30, 96).rotateX(Math.PI / 2);
    const base = await baseOf(
      at('wheel', tire, (m) => {
        m.position.set(0, 70, 0);
        m.rotation.z = 1;
      }),
    );

    expect(spanOf(base, 1)).toBeCloseTo(30, 0);
    expect(spanOf(base, 0)).toBeLessThan(20);
  });

  it('keeps the full footprint of a flat foot turned on the floor', async () => {
    const base = await baseOf(
      at('foot', new THREE.BoxGeometry(40, 10, 100), (m) => {
        m.position.set(0, 5, 0);
        m.rotation.y = Math.PI / 4;
      }),
    );

    expect(base).toHaveLength(4);
    expect(spanOf(base, 0)).toBeCloseTo((140 * Math.SQRT2) / 2, 0);
  });

  it('gives a tilted foot only its low edge', async () => {
    const base = await baseOf(
      at('foot', new THREE.BoxGeometry(100, 10, 40), (m) => {
        m.position.set(0, 20, 0);
        m.rotation.z = 0.2;
      }),
    );

    expect(spanOf(base, 0)).toBeLessThan(6);
    expect(spanOf(base, 1)).toBeCloseTo(40, 0);
  });
});

describe('which parts touch a servo', () => {
  const servo = () => at('servo', new THREE.BoxGeometry(20, 40, 40), () => {});
  const cradle = (gapMm: number, scale = 1) => {
    const group = new THREE.Group();
    const plate = (x: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(3, 60, 60));

      mesh.position.set(x, 0, 0);
      group.add(mesh);
    };
    const reach = (10 + gapMm + 1.5) / scale;

    plate(-reach);
    plate(reach);
    group.scale.setScalar(scale);

    return { id: 'cradle', object: group };
  };
  const touching = async (objects: Array<{ id: string; object: THREE.Object3D }>) =>
    gapsIn(snapshotShapes(objects), [['cradle', 'servo']], 1);

  it('clears a part whose outline wraps the servo but stands 5 mm off it', async () => {
    expect(await touching([cradle(5), servo()])).toEqual([]);
  });

  it('finds a part 0.5 mm from the servo', async () => {
    expect(await touching([cradle(0.5), servo()])).toEqual([['cradle', 'servo']]);
  });

  it('finds a part pressed into the servo', async () => {
    expect(await touching([cradle(-2), servo()])).toEqual([['cradle', 'servo']]);
  });

  it('measures the gap in millimetres when a part is scaled', async () => {
    expect(await touching([cradle(3, 2), servo()])).toEqual([]);
    expect(await touching([cradle(0.5, 2), servo()])).toEqual([['cradle', 'servo']]);
  });
});
