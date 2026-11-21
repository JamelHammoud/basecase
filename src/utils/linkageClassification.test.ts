import { describe, expect, it } from 'vitest';
import { grashofClass, type FourBar, type GrashofClass } from './linkageKinematics';

function previousClass(l: FourBar): GrashofClass {
  const links = [l.ground, l.crank, l.coupler, l.rocker];
  const sorted = [...links].sort((a, b) => a - b);
  const slack = sorted[1] + sorted[2] - sorted[0] - sorted[3];

  if (Math.abs(slack) < 1e-9 * sorted[3]) return 'change-point';

  if (slack < 0) return 'triple-rocker';

  const classes: GrashofClass[] = ['double-crank', 'crank-rocker', 'double-rocker', 'rocker-crank'];

  return classes[links.indexOf(sorted[0])];
}

const linkage = (lengths: number[]): FourBar => ({
  ground: lengths[0],
  crank: lengths[1],
  coupler: lengths[2],
  rocker: lengths[3],
  point: [100, 0],
});

describe('four-bar classification', () => {
  it('preserves every class and first-shortest tie across ordered length combinations', () => {
    const seen = new Set<GrashofClass>();

    for (let code = 0; code < 6 ** 4; code++) {
      const lengths = Array.from({ length: 4 }, (_, axis) => 10 * (1 + (Math.floor(code / 6 ** axis) % 6)));
      const shape = linkage(lengths);
      const saved = structuredClone(shape);
      const actual = grashofClass(shape);

      seen.add(actual);
      expect(actual).toBe(previousClass(shape));
      expect(shape).toEqual(saved);
      shape.crank += 7;
      expect(grashofClass(shape)).toBe(previousClass(shape));
    }

    expect([...seen].sort()).toEqual(
      ['change-point', 'crank-rocker', 'double-crank', 'double-rocker', 'rocker-crank', 'triple-rocker'].sort(),
    );
  });

  it('preserves tolerance boundaries, zero lengths and nonfinite inputs', () => {
    const values = [0, -0, -10, 20, 40, 50, 80, 80 - 1e-8, 80 + 1e-8, 80 - 1e-6, 80 + 1e-6, Infinity, -Infinity, NaN];

    for (const value of values) {
      for (let axis = 0; axis < 4; axis++) {
        const lengths = [40, 20, 50, 50];

        lengths[axis] = value;

        const shape = linkage(lengths);

        expect(grashofClass(shape)).toBe(previousClass(shape));
      }
    }
  });
});
