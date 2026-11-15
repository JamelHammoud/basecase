import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { place, type Placed } from '../three/analysis/collide';
import { solidFromPositions } from '../three/analysis/shapeSolid';
import type { FastenerChain, V3 } from './assemblyTypes';
import { driverOptions } from './driverAccess';

const chain: FastenerChain = {
  id: 'screw',
  d: 3,
  axis: [0, 1, 0],
  tip: [0, -8, 0],
  top: [0, 0, 0],
  headR: 3,
  stack: [],
  endsIn: { kind: 'printed' },
  engagementMm: 8,
  needMm: 4,
  problems: [],
};

function box(id: string, size: V3, at: V3, transform = new THREE.Matrix4()): Placed {
  const geometry = new THREE.BoxGeometry(...size).toNonIndexed();
  const matrix = transform.clone().multiply(new THREE.Matrix4().makeTranslation(...at));

  return place(id, solidFromPositions(geometry.attributes.position.array as Float32Array), matrix);
}

function fixture(transform = new THREE.Matrix4()) {
  return [
    box('wall', [1, 40, 300], [12.5, 20, 0], transform),
    box('lid', [300, 2, 300], [0, 41.2, 0], transform),
    box('floor', [300, 2, 300], [0, -2, 0], transform),
    box('skipped', [300, 2, 300], [0, 10, 0], transform),
    box('screw', [300, 2, 300], [0, 12, 0], transform),
    box('distant', [2, 2, 2], [500, 500, 500], transform),
  ];
}

const skipped = new Set(['skipped']);

describe('driver sweep preparation', () => {
  it('preserves all tool options and blocker order through rigid placement changes', () => {
    const parts = fixture();
    const before = parts.map((part) => ({ box: part.box.clone(), matrix: part.matrix.clone() }));
    const expected = driverOptions(chain, parts, skipped);

    expect(expected.map((option) => option.blockers)).toEqual([
      ['lid'],
      ['wall'],
      ['wall'],
      ['wall'],
      ['wall'],
      [],
      [],
      ['lid'],
      ['wall', 'lid'],
      ['wall', 'lid'],
      ['wall', 'lid'],
      ['lid'],
      ['lid'],
      ['lid'],
      ['lid'],
    ]);

    for (const angles of [
      [0.3, 0, 0],
      [Math.PI / 2, 0, 0],
      [Math.PI, 0, 0],
    ] as V3[]) {
      const transform = new THREE.Matrix4().compose(
        new THREE.Vector3(37, -14, 23),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...angles)),
        new THREE.Vector3(1, 1, 1),
      );
      const moved: FastenerChain = {
        ...chain,
        top: new THREE.Vector3(...chain.top).applyMatrix4(transform).toArray(),
        tip: new THREE.Vector3(...chain.tip).applyMatrix4(transform).toArray(),
        axis: new THREE.Vector3(...chain.axis).transformDirection(transform).toArray(),
      };

      expect(driverOptions(moved, fixture(transform), skipped)).toEqual(expected);
    }

    expect(parts.map((part) => ({ box: part.box, matrix: part.matrix }))).toEqual(before);
    expect(skipped).toEqual(new Set(['skipped']));
  });

  it('reads current geometry and skip choices without changing previous results', () => {
    const parts = fixture();
    const first = driverOptions(chain, parts, skipped);
    const saved = structuredClone(first);
    const noLid = driverOptions(chain, parts, new Set(['skipped', 'lid']));
    const away: FastenerChain = { ...chain, top: [600, 0, 0], tip: [600, -8, 0] };

    expect(noLid[0].blockers).toEqual([]);
    expect(noLid.slice(1, 7)).toEqual(first.slice(1, 7));
    expect(driverOptions(away, parts, skipped).every((option) => option.blockers.length === 0)).toBe(true);
    expect(first).toEqual(saved);
    expect(driverOptions(chain, parts, skipped)).toEqual(first);
    expect(driverOptions(chain, [], skipped).map((option) => option.tool)).toEqual(first.map((option) => option.tool));
  });

  it.each([300, 600])('prepares one search envelope for %i scene parts', (count) => {
    const solid = box('source', [2, 2, 2], [500, 500, 500]);
    const parts = Array.from({ length: count }, (_, i) => ({ ...solid, id: `part-${i}` }));
    const expansion = vi.spyOn(THREE.Box3.prototype, 'expandByScalar');
    const cosine = vi.spyOn(Math, 'cos');
    const sine = vi.spyOn(Math, 'sin');
    let expansions: number;
    let cosines: number;
    let sines: number;

    try {
      const options = driverOptions(chain, parts, new Set());

      expansions = expansion.mock.calls.length;
      cosines = cosine.mock.calls.length;
      sines = sine.mock.calls.length;
      expect(options).toHaveLength(15);
      expect(options.every((option) => option.blockers.length === 0)).toBe(true);
    } finally {
      expansion.mockRestore();
      cosine.mockRestore();
      sine.mockRestore();
    }

    expect({ expansions, cosines, sines }).toEqual({ expansions: 1, cosines: 262, sines: 270 });
  });
});
