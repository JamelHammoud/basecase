import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RobotSkeleton, ZUpVec } from '../types/skeleton';
import { measureSkeletonLink } from './skeletonLinkMeasure';
import { skeletonSizing } from './skeletonSizing';
import { SkeletonTree } from './skeletonTree';

function previousMeasurement(origin: ZUpVec, ends: ZUpVec[]) {
  const distances = ends.map((end) => Math.hypot(...end.map((value, k) => value - origin[k])));
  const weights = distances.map((distance) => distance || 1);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const at = ends.length
    ? ([0, 1, 2].map(
        (k) => ends.reduce((sum, end, i) => sum + ((origin[k] + end[k]) / 2) * weights[i], 0) / total,
      ) as ZUpVec)
    : origin;

  return { length: distances.reduce((length, distance) => Math.max(length, distance), 0), at };
}

function point(seed: number): ZUpVec {
  return [Math.sin(seed * 7) * 1000, Math.cos(seed * 3) * 1000, Math.sin(seed * 11) * 1000];
}

function withMeasuredMasses(skeleton: RobotSkeleton): RobotSkeleton {
  const tree = new SkeletonTree(skeleton);
  const freeLength = skeleton.joints
    .filter((joint) => !joint.linkMassG)
    .reduce((sum, joint) => sum + tree.linkLength(joint), 0);
  const fixed = skeleton.joints.reduce((sum, joint) => sum + (joint.linkMassG ?? 0), 0);
  const spread = Math.max(0, skeleton.massG! - fixed) * 0.45;

  return {
    ...skeleton,
    joints: skeleton.joints.map((joint) => ({
      ...joint,
      linkMassG: joint.linkMassG ?? (freeLength ? (spread * tree.linkLength(joint)) / freeLength : 0),
    })),
  };
}

afterEach(() => vi.restoreAllMocks());

describe('skeleton link measurements', () => {
  it('matches separate length and weighted-center scans across branches and edits', () => {
    for (let seed = 0; seed < 300; seed++) {
      const origin = point(seed);
      const ends = Array.from({ length: seed % 13 }, (_, i) => point(seed + i));
      const before = structuredClone({ origin, ends });
      const measured = measureSkeletonLink(origin, ends);

      expect(measured).toEqual(previousMeasurement(origin, ends));
      expect({ origin, ends }).toEqual(before);

      const editedOrigin: ZUpVec = [-origin[0], origin[1], origin[2]];

      ends.push(point(seed + 20));
      expect(measureSkeletonLink(editedOrigin, ends)).toEqual(previousMeasurement(editedOrigin, ends));
      expect(measured).toEqual(previousMeasurement(before.origin, before.ends));
    }
  });

  it('keeps zero-length endpoint weights, endpoint order and exceptional coordinates', () => {
    const origin: ZUpVec = [0, 0, 0];
    const ends: ZUpVec[] = [
      [0, 0, 0],
      [100, 0, 0],
      [0, 200, 0],
    ];

    expect(measureSkeletonLink(origin, ends)).toEqual({ length: 200, at: [5000 / 301, 20000 / 301, 0] });
    expect(measureSkeletonLink(origin, [])).toEqual({ length: 0, at: origin });

    for (const value of [-0, Number.MIN_VALUE, Number.MAX_VALUE, Infinity, -Infinity, NaN]) {
      const exceptional: ZUpVec[] = [
        [value, 0, 0],
        [0, value, 0],
        [0, 0, value],
      ];

      expect(measureSkeletonLink(origin, exceptional)).toEqual(previousMeasurement(origin, exceptional));
      expect(measureSkeletonLink([value, value, value], ends)).toEqual(
        previousMeasurement([value, value, value], ends),
      );
    }
  });

  it.each([300, 600])('measures each of %i endpoints once for both length and center', (count) => {
    const ends = Array.from({ length: count }, (_, i) => point(i));
    const expected = previousMeasurement([0, 0, 0], ends);
    const hypot = vi.spyOn(Math, 'hypot');
    const result = measureSkeletonLink([0, 0, 0], ends);

    expect(hypot).toHaveBeenCalledTimes(count);
    expect(result).toEqual(expected);
  });

  it('keeps complete sizing results when mixed link masses are assigned by the separate measurements', () => {
    for (let seed = 0; seed < 60; seed++) {
      const skeleton: RobotSkeleton = {
        frame: 'z-up',
        pairs: [],
        massG: seed * 50 + 1,
        joints: Array.from({ length: 12 }, (_, i) => ({
          id: `joint-${i}`,
          parent: i ? `joint-${Math.floor((i - 1) / 2)}` : undefined,
          origin: point(seed + i),
          axis: point(seed + i + 1),
          tip: i % 4 ? point(seed + i + 2) : undefined,
          linkMassG: [undefined, 0, 20, -5][(seed + i) % 4],
          payloadG: i % 3 ? undefined : 100,
          limb: seed % 2 ? 'leg' : 'arm',
        })),
      };

      expect(skeletonSizing(skeleton)).toEqual(skeletonSizing(withMeasuredMasses(skeleton)));
      skeleton.joints[0].origin[2] += 100;
      expect(skeletonSizing(skeleton)).toEqual(skeletonSizing(withMeasuredMasses(skeleton)));
    }
  });

  it.each([300, 600])('prepares each of %i links once during sizing and refreshes after edits', (count) => {
    const skeleton: RobotSkeleton = {
      frame: 'z-up',
      pairs: [],
      massG: count * 100,
      joints: Array.from({ length: count }, (_, i) => ({
        id: `joint-${i}`,
        origin: [0, 0, 0],
        axis: [0, 1, 0],
        tip: [100, 0, 0],
        range: [0, 0],
      })),
    };
    const ends = vi.spyOn(SkeletonTree.prototype, 'linkEnds');
    const result = skeletonSizing(skeleton);

    if (typeof result === 'string') throw new Error(result);

    expect(ends).toHaveBeenCalledTimes(count);
    expect(result.joints.map((joint) => joint.massG)).toEqual(Array.from({ length: count }, () => 45));
    expect(result.joints[0].holdNm).toBeCloseTo(0.045 * 9.81 * 0.05, 12);
    expect(result.joints[0].inertiaKgM2).toBeCloseTo(0.045 * 0.1 ** 2, 12);
    skeleton.joints[0].tip = [200, 0, 0];

    const edited = skeletonSizing(skeleton);

    if (typeof edited === 'string') throw new Error(edited);

    const editedG = (skeleton.massG! * 0.45 * 200) / (count * 100 + 100);

    expect(ends).toHaveBeenCalledTimes(count * 2);
    expect(edited.joints[0].massG).toBeCloseTo(editedG, 12);
    expect(edited.joints[0].holdNm).toBeCloseTo((editedG / 1000) * 9.81 * 0.1, 12);
    expect(edited.joints[0].inertiaKgM2).toBeCloseTo((editedG / 1000) * 0.2 ** 2, 12);
    expect(result.joints[0].massG).toBe(45);
  });
});
