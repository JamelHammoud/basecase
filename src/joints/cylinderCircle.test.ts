import { describe, expect, it } from 'vitest';
import { determinant3, solve3 } from '../utils/solve3';
import { fitCircle } from './cylinderFit';

function rowCircle(points: Array<[number, number]>): { cx: number; cy: number; r: number } | null {
  if (points.length < 3) return null;

  const mx = points.reduce((s, p) => s + p[0], 0) / points.length;
  const my = points.reduce((s, p) => s + p[1], 0) / points.length;
  const a = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const b = [0, 0, 0];

  for (const [px, py] of points) {
    const x = px - mx;
    const y = py - my;
    const row = [x, y, 1];
    const rhs = -(x * x + y * y);

    for (let i = 0; i < 3; i++) {
      b[i] += row[i] * rhs;

      for (let j = i; j < 3; j++) a[i][j] += row[i] * row[j];
    }
  }

  for (let i = 0; i < 3; i++) for (let j = 0; j < i; j++) a[i][j] = a[j][i];

  const determinant = determinant3(a);

  if (Math.abs(determinant) < 1e-12) return null;

  const s = solve3(a, b, determinant);

  const cx = -s[0] / 2;
  const cy = -s[1] / 2;
  const r2 = cx * cx + cy * cy - s[2];

  return r2 > 0 ? { cx: cx + mx, cy: cy + my, r: Math.sqrt(r2) } : null;
}

describe('circle equation accumulation', () => {
  it('matches row equations exactly across translated, noisy and partial circles', () => {
    for (let trial = 0; trial < 160; trial++) {
      const count = 3 + trial * 2;
      const radius = 0.01 * 2 ** (trial % 18);
      const span = Math.PI * (0.1 + (trial % 20) / 10);
      const points: Array<[number, number]> = Array.from({ length: count }, (_, i) => {
        const angle = (i * span) / count;
        const r = radius * (1 + Math.sin(i * 17 + trial) * 0.001);

        return [trial * 10 + r * Math.cos(angle), -trial * 3 + r * Math.sin(angle)];
      });
      const before = structuredClone(points);

      expect(fitCircle(points)).toEqual(rowCircle(points));
      expect(points).toEqual(before);
    }
  });

  it.each([0, -0, 1e-12, Infinity, -Infinity, NaN])('matches degenerate and nonfinite rows for %s', (value) => {
    const points: Array<[number, number]> = [
      [value, 0],
      [value, 1],
      [value, -1],
      [0, value],
    ];

    expect(fitCircle(points)).toEqual(rowCircle(points));
    expect(fitCircle(points.slice(0, 2))).toBeNull();
    expect(
      fitCircle([
        [value, value],
        [value, value],
        [value, value],
      ]),
    ).toEqual(
      rowCircle([
        [value, value],
        [value, value],
        [value, value],
      ]),
    );
  });
});
