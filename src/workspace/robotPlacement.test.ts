import { describe, expect, it } from 'vitest';
import type { ScenePart } from '../types/robotics';
import { articulatedShift, importOffset, robotHeightMm } from './robotPlacement';

const part = (over: Partial<ScenePart> = {}): ScenePart => ({
  id: 'part',
  name: 'Part',
  kind: 'box',
  category: 'structure',
  role: 'solid',
  position: [10, 25, -5],
  rotation: [0, 0, 0],
  dimensions: { width: 20, height: 50, depth: 10 },
  color: '#cccccc',
  note: '',
  visible: true,
  locked: false,
  ...over,
});

const incoming = () => [
  part(),
  part({ id: 'top', position: [-30, 70, 20], dimensions: { width: 10, height: 30, depth: 40 } }),
];

describe('placement ranges', () => {
  it('centers imports at the drop point and lifts articulated parts from their lowest face', () => {
    const parts = incoming();
    const before = structuredClone(parts);
    const at: [number, number, number] = [100, 12, -80];

    expect(importOffset(parts, at, [])).toEqual([107.5, 12, -95]);
    expect(articulatedShift(parts, at, [])).toEqual([107.5, 12, -95]);
    expect(robotHeightMm(parts)).toBe(85);
    expect(parts).toEqual(before);

    const lifted = parts.map((p) => ({
      ...p,
      position: [p.position[0], p.position[1] + 17, p.position[2]] as [number, number, number],
    }));

    expect(importOffset(lifted, at, [])).toEqual([107.5, 12, -95]);
    expect(articulatedShift(lifted, at, [])).toEqual([107.5, -5, -95]);
    expect(robotHeightMm(lifted)).toBe(85);
  });

  it('keeps the existing gaps beyond rotated obstacles and ignores hidden parts and images', () => {
    const obstacle = part({ position: [100.25, 0, 0], rotation: [0, 0, 90] });
    const scene = [
      obstacle,
      part({ visible: false, position: [1000, 0, 0] }),
      part({ kind: 'image_plane', position: [2000, 0, 0] }),
    ];

    expect(importOffset(incoming(), undefined, scene)).toEqual([261, 0, 0]);
    expect(articulatedShift(incoming(), undefined, scene)).toEqual([201, 0, 0]);
    expect(importOffset(incoming(), undefined, scene.slice(1))).toEqual([0, 0, 0]);
    expect(articulatedShift(incoming(), undefined, scene.slice(1))).toEqual([0, 0, 0]);
  });

  it('preserves empty-range results', () => {
    expect(importOffset([], undefined, [])).toEqual([0, 0, 0]);
    expect(articulatedShift([], undefined, [])).toEqual([0, 0, 0]);
    expect(importOffset([], [1, 2, 3], [])).toEqual([NaN, 2, NaN]);
    expect(articulatedShift([], [1, 2, 3], [])).toEqual([NaN, -Infinity, NaN]);
    expect(robotHeightMm([])).toBe(-Infinity);
  });

  it.each([600, 1200])('reads each incoming coordinate and dimension once for %i articulated parts', (count) => {
    let coordinateReads = 0;
    let dimensionReads = 0;
    const original = part();
    const tracked = part({
      position: new Proxy(original.position, {
        get(target, key, receiver) {
          if (key === '0' || key === '1' || key === '2') coordinateReads++;

          return Reflect.get(target, key, receiver);
        },
      }),
      dimensions: new Proxy(original.dimensions, {
        get(target, key, receiver) {
          dimensionReads++;

          return Reflect.get(target, key, receiver);
        },
      }),
    });

    expect(
      articulatedShift(
        Array.from({ length: count }, () => tracked),
        [0, 0, 0],
        [],
      ),
    ).toEqual([-10, 0, 5]);
    expect(coordinateReads).toBe(count * 3);
    expect(dimensionReads).toBe(count * 3);
  });

  it('handles incoming robots and existing scenes beyond the function argument limit', () => {
    const repeated = part();
    const parts = Array.from({ length: 150_000 }, () => repeated);
    const scene = Array.from({ length: 150_000 }, () => parts[0]);

    expect(importOffset(parts, [0, 0, 0], [])).toEqual([-10, 0, 5]);
    expect(articulatedShift(parts, [0, 0, 0], [])).toEqual([-10, 0, 5]);
    expect(importOffset(parts, undefined, scene)).toEqual([120, 0, 0]);
    expect(articulatedShift(parts, undefined, scene)).toEqual([60, 0, 0]);
    expect(robotHeightMm(parts)).toBe(50);
  });
});
