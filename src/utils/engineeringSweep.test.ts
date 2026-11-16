import { describe, expect, it } from 'vitest';
import { box, joint, part, row, run } from './engineering.fixtures';
import { angle } from './angle';
import { sweepSamples } from './engineeringJoints';
import type { RobotJoint } from '../types/robotics';
import type { EngineeringInputs } from './engineeringTypes';
import { seededRandom } from './seededRandom';

type Clash = ReturnType<NonNullable<EngineeringInputs['sweep']>>[number];

const turning = (range: [number, number] = [-90, 90], published?: string) =>
  joint('hinge', { parent: ['frame'], child: ['link'], range, published });

function report(j: RobotJoint, clashes: Clash[]) {
  return row(
    run(
      {
        parts: [part('frame'), part('link')],
        measures: { frame: box([0, 0, 0], [10, 10, 10]), link: box([20, 0, 0], [30, 10, 10]) },
        joints: [j],
      },
      {},
      { sweep: () => clashes },
    ),
    'Range of motion',
  );
}

function previousItems(j: RobotJoint, clashes: Clash[]) {
  const range = j.range!;
  const samples = sweepSamples(j, range);
  const retained = clashes.filter((c) => c.depthMm > (j.published ? 5 : 0.3) && !(c.b === 'floor' && j.published));

  return [-1, 1].flatMap((sign) => {
    const first = retained
      .filter((c) => Math.sign(c.angle) === sign)
      .sort((a, b) => Math.abs(a.angle) - Math.abs(b.angle))[0];

    if (!first) return [];

    const clear =
      samples
        .filter((a) => Math.sign(a) === sign && Math.abs(a) < Math.abs(first.angle))
        .sort((a, b) => Math.abs(b) - Math.abs(a))[0] ?? 0;
    const end = sign < 0 ? Math.min(...range) : Math.max(...range);
    const what = first.b === 'floor' ? 'touches the floor' : `meets the ${first.b}`;

    return [
      {
        text: `Hinge: clear to ${angle(clear)} of ${angle(end)}; at ${angle(first.angle)} the ${first.a} ${what}`,
        ids: first.b === 'floor' ? [first.a] : [first.a, first.b],
        ...(j.published ? { status: 'warn' as const } : {}),
      },
    ];
  });
}

describe('Range-of-motion boundaries', () => {
  it('preserves findings across unordered clashes, tied pairs, floor rules, ranges and later edits', () => {
    const random = seededRandom('57e71a0b2c6d438f90aebc112548a907');

    for (let i = 0; i < 100; i++) {
      const j = turning(
        [Math.round(random() * 180 - 90), Math.round(random() * 180 - 90)],
        i % 2 ? 'maker' : undefined,
      );
      const clashes = Array.from({ length: i }, (_, k) => ({
        a: `link${k}`,
        b: k % 3 ? 'frame' : 'floor',
        angle: Math.round(random() * 24 - 12) * 15,
        depthMm: [0.3, 0.31, 5, 5.01][k % 4],
      }));
      const snapshot = structuredClone(clashes);

      expect(report(j, clashes)?.items).toEqual(previousItems(j, clashes));
      expect(clashes).toEqual(snapshot);
      clashes.reverse();
      clashes.push({ a: 'edited', b: 'frame', angle: -1, depthMm: 10 });
      expect(report(j, clashes)?.items).toEqual(previousItems(j, clashes));
    }
  });

  it('retains first ties, zero fallback and nonfinite angle handling', () => {
    const clashes = [NaN, 0, -0, -Infinity, Infinity, -15, 15, -15, 15].map((a, i) => ({
      a: `link${i}`,
      b: 'frame',
      angle: a,
      depthMm: 10,
    }));

    for (const values of [[], clashes.slice(0, 5), clashes, clashes.toReversed()]) {
      expect(report(turning(), values)?.items).toEqual(previousItems(turning(), values));
    }
  });

  it.each([300, 600])('reads each of %i clash angles once per direction without sorting', (count) => {
    let reads = 0;
    const clashes = Array.from({ length: count }, (_, i) => ({
      a: `link${i}`,
      b: 'frame',
      depthMm: 10,
      get angle() {
        reads++;

        return ((i * 37) % count) - count / 2 + 0.5;
      },
    }));
    const expected = previousItems(turning(), clashes);
    const previousReads = reads;

    reads = 0;
    expect(report(turning(), clashes)?.items).toEqual(expected);
    expect(reads).toBe(2 * count + 4);
    expect(reads).toBeLessThan(previousReads);
  });
});
