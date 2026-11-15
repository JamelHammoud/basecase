import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { place, type Placed } from '../three/analysis/collide';
import { ShapeSolid } from '../three/analysis/shapeSolid';
import type { ChainResult } from './assemblyTypes';
import { fitProbes } from './fitProbes';

const noChains: ChainResult = { screws: [], sleeves: [] };

function box(id: string, size: [number, number, number], matrix = new THREE.Matrix4()): Placed {
  const geometry = new THREE.BoxGeometry(...size).toNonIndexed();
  const solid = new ShapeSolid(new Float32Array(geometry.getAttribute('position').array));

  geometry.dispose();

  return place(id, solid, matrix);
}

const movedBox = (id: string, x: number, width = 1) =>
  box(id, [width, 30, 30], new THREE.Matrix4().makeTranslation(x, 0, 0));

function allHitRoom(pack: Placed, placed: Placed[]) {
  const size = pack.box.getSize(new THREE.Vector3());
  const centre = pack.box.getCenter(new THREE.Vector3());
  const lengths = size.toArray();
  const axis = lengths.indexOf(Math.max(...lengths));
  const room = [1, -1].map((sign) => {
    const direction = new THREE.Vector3().setComponent(axis, sign);
    const origin = centre.clone().addScaledVector(direction, lengths[axis] / 2 + 0.05);
    let nearest = 200;

    for (const target of placed) {
      if (target.id === pack.id) continue;

      const ray = new THREE.Ray(
        origin.clone().applyMatrix4(target.inverse),
        direction.clone().transformDirection(target.inverse),
      );
      const hits = target.solid.bvh.raycast(ray, THREE.DoubleSide).map((hit) => hit.distance);

      hits.sort((a, b) => a - b);

      if (hits.length && hits[0] < nearest) nearest = hits[0];
    }

    return nearest;
  });

  return Math.max(...room);
}

const measuredRoom = (pack: Placed, others: Placed[]) =>
  fitProbes([pack, ...others], noChains, [pack.id]).leadRoomMm[pack.id];

describe('battery lead clearance', () => {
  it('keeps the freer end, ignores misses and excludes the pack itself', () => {
    const pack = box('pack', [40, 20, 10]);
    const right = movedBox('right', 35, 10);
    const left = movedBox('left', -60, 10);
    const miss = box('miss', [2, 2, 2], new THREE.Matrix4().makeTranslation(25, 50, 0));

    expect(measuredRoom(pack, [right, left, miss])).toBeCloseTo(34.95, 10);
    expect(measuredRoom(pack, [left, miss, right])).toBe(allHitRoom(pack, [left, miss, right]));
    expect(measuredRoom(pack, [right])).toBe(200);
    expect(measuredRoom(pack, [])).toBe(200);
  });

  it.each([
    [40, 20, 10],
    [20, 40, 10],
    [20, 10, 40],
    [40, 40, 10],
  ] as const)('keeps longest-axis and tie selection for dimensions %j', (...dimensions) => {
    const pack = box('pack', [...dimensions]);
    const shell = box('shell', [90, 100, 110]);

    expect(measuredRoom(pack, [shell])).toBe(allHitRoom(pack, [shell]));
  });

  it.each([0, 0.3, Math.PI / 2, Math.PI])('matches all-hit distances for rotated obstacles at %j', (angle) => {
    const pack = box('pack', [40, 20, 10], new THREE.Matrix4().makeTranslation(7, 11, -3));
    const matrix = new THREE.Matrix4().makeRotationZ(angle).setPosition(50, 11, -3);
    const right = box('right', [10, 50, 30], matrix);
    const left = box('left', [10, 30, 30], new THREE.Matrix4().makeTranslation(-40, 11, -3));

    expect(measuredRoom(pack, [right, left])).toBe(allHitRoom(pack, [right, left]));
  });

  it.each([-0.4, 0, 0.01, 9.99, 10, 10.01, 199.99, 200, 200.01, 350])(
    'keeps limits and starts inside an obstacle with an end gap of %j mm',
    (gap) => {
      const pack = box('pack', [40, 20, 10]);
      const end = 20.05 + gap;
      const walls = [movedBox('right', end + 0.5), movedBox('left', -end - 0.5)];

      expect(measuredRoom(pack, walls)).toBe(allHitRoom(pack, walls));
    },
  );

  it('measures multiple packs independently with scaled and mirrored obstacles', () => {
    const packs = [
      box('pack-x', [40, 20, 10]),
      box('pack-y', [10, 40, 20], new THREE.Matrix4().makeTranslation(80, 30, 0)),
    ];
    const obstacles = [
      movedBox('wall', 45),
      box('shell', [40, 80, 30], new THREE.Matrix4().makeScale(-2, 0.5, 1).setPosition(80, 30, 0)),
    ];
    const placed = [...packs, ...obstacles];
    const expected = Object.fromEntries(packs.map((pack) => [pack.id, allHitRoom(pack, placed)]));

    expect(
      fitProbes(
        placed,
        noChains,
        packs.map((pack) => pack.id),
      ).leadRoomMm,
    ).toEqual(expected);
    expect(
      fitProbes(
        [...placed].reverse(),
        noChains,
        packs.map((pack) => pack.id),
      ).leadRoomMm,
    ).toEqual(expected);
  });

  it('reads changed placements afresh and preserves source geometry and matrices', () => {
    const pack = box('pack', [40, 20, 10]);
    const wall = movedBox('wall', 30);
    const before = { positions: wall.solid.positions.slice(), matrix: wall.matrix.toArray() };
    const left = movedBox('left', -45);
    const first = measuredRoom(pack, [wall, left]);
    const shifted = place(wall.id, wall.solid, new THREE.Matrix4().makeTranslation(80, 0, 0));
    const next = measuredRoom(pack, [shifted, left]);

    expect(first).toBeCloseTo(24.45, 10);
    expect(next).toBeCloseTo(59.45, 10);
    expect(wall.solid.positions).toEqual(before.positions);
    expect(wall.matrix.toArray()).toEqual(before.matrix);
    expect(fitProbes([pack], noChains, ['missing', pack.id]).leadRoomMm).toEqual({ pack: 200 });
  });

  it.each([300, 600])('uses bounded nearest-hit queries for a solid with %j layers', (layers) => {
    const pack = box('pack', [40, 20, 10]);
    const positions = new Float32Array(layers * 108);

    for (let i = 0; i < layers; i++) {
      const slab = movedBox(`slab-${i}`, 30 + i * 2);
      const geometry = new THREE.BufferGeometry();

      geometry.setAttribute('position', new THREE.BufferAttribute(slab.solid.positions.slice(), 3));
      geometry.applyMatrix4(slab.matrix);
      positions.set(geometry.getAttribute('position').array, i * 108);
      geometry.dispose();
    }

    const layered = place('layered', new ShapeSolid(positions), new THREE.Matrix4());
    const left = movedBox('left', -35);
    const allHits = vi.spyOn(layered.solid.bvh, 'raycast');
    const expected = allHitRoom(pack, [layered, left]);
    const collected = allHits.mock.results.reduce((total, result) => total + result.value.length, 0);
    const firstHit = vi.spyOn(layered.solid.bvh, 'raycastFirst');
    const leftHit = vi.spyOn(left.solid.bvh, 'raycastFirst');

    allHits.mockClear();

    expect(measuredRoom(pack, [layered, left])).toBe(expected);
    expect(collected).toBe(layers * 4);
    expect(allHits).not.toHaveBeenCalled();
    expect(firstHit).toHaveBeenCalledTimes(2);
    expect(leftHit).toHaveBeenCalledTimes(2);
    expect(leftHit.mock.calls.map((call) => call.slice(1))).toEqual([
      [THREE.DoubleSide, 0, 9.45],
      [THREE.DoubleSide, 0, 200],
    ]);
  });
});
