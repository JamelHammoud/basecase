import { describe, expect, it, vi } from 'vitest';
import type { LoopClosure } from '../types/loopClosure';
import { loopValue } from './kinematicsLoop';
import { closure, toDegrees, toRadians } from './linkageKinematics';
import { seededRandom } from './seededRandom';

function previousAngles(l: LoopClosure['fourBar'], theta: number) {
  const closed = closure(l, toRadians(theta));

  if (!closed) return null;

  const { b, c } = closed;

  return {
    coupler: toDegrees(Math.atan2(c[1] - b[1], c[0] - b[0])),
    rocker: toDegrees(Math.atan2(c[1], c[0] - l.ground)),
  };
}

function previousValue(loop: LoopClosure, driverValue: number): number {
  const { fourBar, link } = loop;
  const rest = previousAngles(fourBar, fourBar.theta);
  const now = previousAngles(fourBar, fourBar.theta + driverValue);

  if (!rest || !now) return 0;

  const delta = link === 'rocker' ? now.rocker - rest.rocker : now.coupler - rest.coupler - driverValue;

  return ((((delta + 180) % 360) + 360) % 360) - 180;
}

describe('four-bar link rotation', () => {
  it('preserves both link rotations across edited dimensions, wrapping and nonfinite inputs', () => {
    const random = seededRandom('a23b8c01a23b8c01a23b8c01a23b8c01');
    const fourBar = { ground: 40, crank: 20, coupler: 50, rocker: 50, theta: 0 };

    for (let i = 0; i < 200; i++) {
      fourBar.ground = random() * 100;
      fourBar.crank = random() * 100;
      fourBar.coupler = random() * 100;
      fourBar.rocker = random() * 100;
      fourBar.theta = (random() - 0.5) * 1440;

      for (const link of ['coupler', 'rocker'] as const) {
        const loop: LoopClosure = { driver: 'crank', fourBar, link };

        for (const value of [0, -0, 180, -180, 720, -720, random() * 360, NaN, Infinity]) {
          expect(loopValue({ loop }, value)).toBe(previousValue(loop, value));
        }
      }
    }
  });

  it.each(['coupler', 'rocker'] as const)('omits the unused %s companion angle', (link) => {
    const loop: LoopClosure = {
      driver: 'crank',
      link,
      fourBar: { ground: 40, crank: 20, coupler: 50, rocker: 50, theta: 30 },
    };
    const atan2 = vi.spyOn(Math, 'atan2');

    try {
      const expected = previousValue(loop, 45);

      expect(atan2).toHaveBeenCalledTimes(6);
      atan2.mockClear();
      expect(loopValue({ loop }, 45)).toBe(expected);
      expect(atan2).toHaveBeenCalledTimes(4);
    } finally {
      atan2.mockRestore();
    }
  });

  it('retains zero-angle results and unreachable or coincident-pivot fallback', () => {
    for (const ground of [0, 20, 40, 200, NaN, Infinity]) {
      for (const link of ['coupler', 'rocker'] as const) {
        const loop: LoopClosure = {
          driver: 'crank',
          link,
          fourBar: { ground, crank: 20, coupler: 50, rocker: 50, theta: 0 },
        };

        for (const value of [0, 45, 180]) expect(loopValue({ loop }, value)).toBe(previousValue(loop, value));
      }
    }
  });
});
