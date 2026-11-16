import { MathUtils } from 'three';
import { describe, expect, it } from 'vitest';
import { parseBvh } from './mocap';
import type { MocapRotation } from './mocapBones';
import { wrappedHingeBvh } from './motionSkeleton.fixtures';
import { motionWithEndSites } from './motionSkeletonEnds';
import { motionChains } from './motionSkeletonSource';
import { seededRandom } from './seededRandom';

const motion = motionWithEndSites(parseBvh(wrappedHingeBvh()));
const positions = motion.sample(0);

function chainsFor(angles: (number | undefined)[]) {
  const rotations = angles.map(
    (degrees) => new Map<string, MocapRotation[]>([['Base', degrees === undefined ? [] : [{ axis: 'Z', degrees }]]]),
  );
  const samples = { positions: angles.map(() => positions), rotations };
  const before = structuredClone(samples);
  const chains = motionChains(motion, samples, { scale: 1 });

  expect(samples).toEqual(before);

  return chains;
}

function previousValues(angles: (number | undefined)[]) {
  const raw = angles.map((angle) => angle ?? NaN);
  let previous = raw[0];
  let value = 0;

  return raw.map((angle) => {
    const difference = angle - previous;
    const delta = MathUtils.euclideanModulo(difference + 180, 360) - 180;

    value += delta === -180 && difference > 0 ? 180 : delta;
    previous = angle;

    return value;
  });
}

function expectedChannels(angles: (number | undefined)[]) {
  const values = previousValues(angles);

  return Math.max(...values) - Math.min(...values) < 1e-7 ? [] : [values];
}

describe('motion channel sampling', () => {
  it('preserves seam arithmetic, static exclusion, missing samples and independent repeated calls', () => {
    const random = seededRandom('52da7c0252da7c0252da7c0252da7c02');
    const fixtures = [
      [0],
      [-0, 0, -0],
      [40, 40, 40],
      [170, 180, -170, -160],
      [0, 180, 0, -180, 0],
      [0, 540, -540, 1080],
      [0, undefined, 5],
      [NaN, 0, 1],
      [0, Infinity, 1],
      [0, -Infinity, 1],
      ...Array.from({ length: 100 }, (_, i) => Array.from({ length: i + 2 }, () => random() * 2160 - 1080)),
    ];

    for (const angles of fixtures) {
      const values = previousValues(angles);
      const moving = Math.max(...values) - Math.min(...values) >= 1e-7 || values.some(Number.isNaN);
      const first = chainsFor(angles);

      expect(first[0].axes.map((axis) => axis.values)).toEqual(moving ? [values] : []);
      expect(chainsFor(angles)).toEqual(first);
      angles[angles.length - 1] = 73;
      expect(chainsFor(angles)[0].axes.map((axis) => axis.values)).toEqual(expectedChannels(angles));
      expect(first[0].axes.map((axis) => axis.values)).toEqual(moving ? [values] : []);
    }
  });

  it('unwraps a long clip without spreading its samples into range arguments', () => {
    const count = 160_000;
    const frames = [0, 1].map((degrees) => new Map<string, MocapRotation[]>([['Base', [{ axis: 'Z', degrees }]]]));
    const samples = {
      positions: Array.from({ length: count }, () => positions),
      rotations: Array.from({ length: count }, (_, i) => frames[i % 2]),
    };
    const chains = motionChains(motion, samples, { scale: 1 });

    expect(chains[0].axes[0].values).toEqual(Array.from({ length: count }, (_, i) => i % 2));
    expect(chains[0].targets).toHaveLength(count);
  });
});
