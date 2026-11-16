import * as THREE from 'three';
import { ExtendedTriangle } from 'three-mesh-bvh';
import { describe, expect, it, vi } from 'vitest';
import { place } from './collide';
import { crossingsOf } from './crossing';
import { ShapeSolid } from './shapeSolid';

type Pair = [ExtendedTriangle, ExtendedTriangle];

const triangle = (points: number[][]) => new ExtendedTriangle(...points.map((p) => new THREE.Vector3().fromArray(p)));
const crossingPair = (offset = 0): Pair => [
  triangle([
    [-2, offset - 2, 0],
    [2, offset - 2, 0],
    [2, offset + 2, 0],
  ]),
  triangle([
    [0, offset - 1, -2],
    [0, offset - 1, 2],
    [0, offset + 3, 2],
  ]),
];

function boxSolid(): ShapeSolid {
  const geometry = new THREE.BoxGeometry(4, 4, 4).toNonIndexed();
  const solid = new ShapeSolid(new Float32Array(geometry.attributes.position.array));

  geometry.dispose();

  return solid;
}

function gather(pairs: Pair[], keep = 24) {
  const solid = boxSolid();
  const placed = place('box', solid, new THREE.Matrix4());
  const cast = vi.spyOn(solid.bvh, 'bvhcast').mockImplementation((_, _matrix, callbacks) => {
    if (!('intersectsTriangles' in callbacks)) return false;

    for (const [a, b] of pairs) {
      if (callbacks.intersectsTriangles(a, b, 0, 0, 0, 0, 0, 0)) return true;
    }

    return false;
  });

  try {
    return crossingsOf(placed, placed, keep);
  } finally {
    cast.mockRestore();
    solid.dispose();
  }
}

describe('triangle crossings', () => {
  it('keeps midpoint and inward direction across vertex order, winding and triangle order', () => {
    const [a, b] = crossingPair();
    const orders = [
      [0, 1, 2],
      [1, 2, 0],
      [2, 0, 1],
      [2, 1, 0],
      [1, 0, 2],
      [0, 2, 1],
    ];

    for (const left of orders) {
      for (const right of orders) {
        const ordered = [a, b].map((t, i) => {
          const corners = [t.a, t.b, t.c];
          const order = i === 0 ? left : right;

          return new ExtendedTriangle(...order.map((j) => corners[j]));
        });
        const expected = ordered[0]
          .getNormal(new THREE.Vector3())
          .add(ordered[1].getNormal(new THREE.Vector3()))
          .negate()
          .normalize();

        for (const pair of [ordered, ordered.toReversed()]) {
          const found = gather([pair as Pair]);

          expect(found).toHaveLength(1);
          expect(found[0].point.toArray()).toEqual([0, -0.5, 0]);
          expect(found[0].into.distanceTo(expected)).toBeLessThan(1e-12);
        }
      }
    }
  });

  it('rejects parallel, degenerate, touching, shallow and short crossings at the existing boundaries', () => {
    const [a, b] = crossingPair();
    const parallel = a.clone();
    const degenerate = triangle([
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ]);
    const shallow = (depth: number) =>
      triangle([
        [0, -1, -depth],
        [0, -1, depth],
        [0, 3, depth],
      ]);
    const short = (length: number) =>
      triangle([
        [0, -length, -2],
        [0, -length, 2],
        [0, 3, 2],
      ]);

    expect(
      gather([
        [a, parallel],
        [a, degenerate],
        [a, short(0)],
        [a, shallow(0.01)],
        [a, short(0.01)],
      ]),
    ).toEqual([]);
    expect(
      gather([
        [a, shallow(0.010001)],
        [a, short(0.010001)],
        [a, b],
      ]),
    ).toHaveLength(3);
  });

  it.each([300, 600])('projects each corner once across %i crossing pairs and keeps owned output vectors', (count) => {
    const pairs = Array.from({ length: count }, (_, i) => crossingPair(i * 4));
    const dot = vi.spyOn(THREE.Vector3.prototype, 'dot');
    const found = gather(pairs, count);
    const calls = dot.mock.calls.length;

    dot.mockRestore();
    expect(calls).toBe(count * 7);
    expect(found.map((c) => c.point.toArray())).toEqual(pairs.map((_, i) => [0, i * 4 - 0.5, 0]));
    expect(new Set(found.map((c) => c.point)).size).toBe(count);
    expect(new Set(found.map((c) => c.into)).size).toBe(count);
  });

  it('retains traversal order, stride sampling and the gathering cap', () => {
    const pairs = Array.from({ length: 2100 }, (_, i) => crossingPair(i * 4));

    expect(gather([], 24)).toEqual([]);
    expect(gather(pairs, 3000)).toHaveLength(2048);
    expect(gather(pairs, 24).map((c) => c.point.y)).toEqual(Array.from({ length: 24 }, (_, i) => i * 85 * 4 - 0.5));
    expect(gather(pairs, 0)).toEqual([]);
  });

  it('finds the same local crossings after a common rigid transform and reads new placements afresh', () => {
    const solid = boxSolid();
    const shift = new THREE.Matrix4().makeRotationY(0.37).setPosition(0.7, 0.4, 0.2);
    const common = new THREE.Matrix4().makeRotationX(0.52).setPosition(50, -30, 20);
    const localA = place('a', solid, new THREE.Matrix4());
    const localB = place('b', solid, shift);
    const before = solid.positions.slice();
    const expected = crossingsOf(localA, localB, 24);
    const moved = crossingsOf(place('a', solid, common), place('b', solid, common.clone().multiply(shift)), 24);

    expect(expected.length).toBeGreaterThan(0);
    expect(moved).toHaveLength(expected.length);

    for (let i = 0; i < moved.length; i++) {
      expect(moved[i].point.distanceTo(expected[i].point)).toBeLessThan(1e-12);
      expect(moved[i].into.distanceTo(expected[i].into)).toBeLessThan(1e-12);
    }

    expect(crossingsOf(localA, place('b', solid, new THREE.Matrix4().makeTranslation(20, 0, 0)), 24)).toEqual([]);
    expect(crossingsOf(localA, localB, 24)).toEqual(expected);
    expect(solid.positions).toEqual(before);
    solid.dispose();
  });
});

it.each([300, 600])('builds vectors only for retained results across %i crossings', (count) => {
  const pairs = Array.from({ length: count }, (_, i) => crossingPair(i * 4));
  const all = gather(pairs, count);
  const clone = vi.spyOn(THREE.Vector3.prototype, 'clone');
  let found: ReturnType<typeof gather>;
  let clones: number;

  try {
    found = gather(pairs, 24);
    clones = clone.mock.calls.length;
  } finally {
    clone.mockRestore();
  }

  const stride = Math.floor(count / 24);

  expect(clones).toBe(0);
  expect(found).toEqual(all.filter((_, i) => i % stride === 0).slice(0, 24));
  expect(new Set(found.flatMap(({ point, into }) => [point, into])).size).toBe(48);
  found[0].point.set(100, 200, 300);
  found[0].into.set(0, 0, 0);
  expect(gather(pairs, 24)).toEqual(all.filter((_, i) => i % stride === 0).slice(0, 24));

  for (const keep of [1, 23, 25, count + 1, 0, -1, 2.5, NaN, Infinity]) {
    const step = Math.max(1, Math.floor(count / keep));

    expect(gather(pairs, keep)).toEqual(all.filter((_, i) => i % step === 0).slice(0, keep));
  }
});
