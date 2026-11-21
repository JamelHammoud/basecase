import { expect, it } from 'vitest';
import { jointPeak, percentile } from './peakTorque';
import { fallPeakNm } from './engineeringFalls';

const reference = (values: number[], q: number) => {
  if (!values.length) return 0;

  return [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.max(0, Math.ceil(q * values.length) - 1))];
};

it('retains percentile ranks across sample orders, duplicates and edited inputs without changing sources', () => {
  for (let length = 0; length < 160; length++) {
    const generated = Array.from({ length }, (_, i) => ((i * 73 + length * 17) % 109) / 7);
    const ascending = [...generated].sort((a, b) => a - b);
    const cases = [generated, ascending, [...ascending].reverse(), generated.map(() => 4)];

    for (const values of cases) {
      const before = [...values];

      for (const q of [-Infinity, -1, 0, 0.01, 0.5, 0.95, 0.99, 1, 2, Infinity, NaN]) {
        expect(percentile(values, q)).toBe(reference(values, q));
      }

      expect(values).toEqual(before);
      values.push(123);
      expect(percentile(values, 0.99)).toBe(reference(values, 0.99));
    }
  }
});

it('preserves stable-sort behavior for signed zeros, nonfinite values and sparse samples', () => {
  const cases = [[-0, 0], [0, -0], [NaN, 4, 2], [4, NaN, 2], [-Infinity, 4, Infinity], Array<number>(5)];

  for (const values of cases) {
    for (const q of [0, 0.5, 0.99, 1, NaN]) expect(percentile(values, q)).toBe(reference(values, q));
  }
});

it('keeps walk and fall results on their existing sample windows', () => {
  const values = Array.from({ length: 560 }, (_, i) => ((i * 73) % 127) / 10);
  const series = { windowS: 0.025, absDemand: [values], sqForce: [values.map((v) => v * v)] };
  const span = { settleS: 2, heatFromS: 3, heatToS: 8 };
  const heat = series.sqForce[0].slice(120, 320);
  const result = jointPeak(series, 0, 20, span);

  expect(result).toEqual({
    p99Nm: reference(values.slice(80), 0.99),
    rmsNm: Math.sqrt(heat.reduce((sum, v) => sum + v, 0) / heat.length),
    overS: 0,
  });
  expect(fallPeakNm(values, 0.01, 1)).toBe(reference(values.slice(70, 130), 0.99));
});
