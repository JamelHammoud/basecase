import { describe, expect, it } from 'vitest';
import type { TorqueSeries } from './peakTorque';
import { walkPower } from './servoAmps';

const trace = (amps?: number[][]): TorqueSeries => ({ windowS: 0.025, absDemand: [], sqForce: [], amps });

describe('Walk current aggregation', () => {
  it('excludes settling and sums simultaneous currents before taking the bus peak', () => {
    const series = trace([
      [100, 200, 2, 8, 2],
      [300, 400, 7, 1, 4],
    ]);
    const original = structuredClone(series);

    expect(walkPower(series, ['hip', 'knee'], { settleS: 0.05 })).toEqual({
      avgA: 8,
      peakA: 9,
      joints: { hip: { avgA: 4, peakA: 8 }, knee: { avgA: 4, peakA: 7 } },
    });
    expect(series).toEqual(original);
  });

  it('keeps each joint’s trailing windows while limiting the bus to the common span', () => {
    expect(
      walkPower(trace([[100, 2, 6, 10], [], [200, 5, 1]]), ['hip', 'fixed', 'knee', 'missing'], { settleS: 0.025 }),
    ).toEqual({
      avgA: 7,
      peakA: 7,
      joints: { hip: { avgA: 6, peakA: 10 }, knee: { avgA: 3, peakA: 5 } },
    });
  });

  it.each([0, 0.025, 0.026, 0.05, 0.075, 1, -0.025, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'keeps the settled slice boundary at %s seconds',
    (settleS) => {
      const amps = [1, 4, 7];
      const included = amps.slice(Math.ceil(settleS / 0.025));
      const avgA = included.length ? included.reduce((sum, value) => sum + value, 0) / included.length : 0;
      const peakA = included.length ? Math.max(...included) : 0;

      expect(walkPower(trace([amps]), ['hip'], { settleS })).toEqual({
        avgA,
        peakA,
        joints: included.length ? { hip: { avgA, peakA } } : {},
      });
    },
  );

  it.each([
    { series: trace(), ids: ['hip'] },
    { series: trace([]), ids: ['hip'] },
    { series: trace([[]]), ids: ['hip'] },
    { series: trace([[1, 2]]), ids: [] },
    { series: trace([[1, 2]]), ids: ['hip'] },
  ])('returns no readings without post-settle samples: $ids', ({ series, ids }) => {
    expect(walkPower(series, ids, { settleS: 1 })).toEqual({ avgA: 0, peakA: 0, joints: {} });
  });

  it('keeps zero-current joints in the bus span', () => {
    expect(
      walkPower(
        trace([
          [0, 0],
          [2, 4, 9],
        ]),
        ['idle', 'hip'],
        { settleS: 0 },
      ),
    ).toEqual({
      avgA: 3,
      peakA: 4,
      joints: { idle: { avgA: 0, peakA: 0 }, hip: { avgA: 5, peakA: 9 } },
    });
  });

  it('summarizes long recordings without passing the samples as function arguments', () => {
    const amps = Array.from({ length: 200_000 }, (_, i) => (i % 2 ? 3 : 1));

    expect(walkPower(trace([amps, amps]), ['hip', 'knee'], { settleS: 0 })).toEqual({
      avgA: 4,
      peakA: 6,
      joints: { hip: { avgA: 2, peakA: 3 }, knee: { avgA: 2, peakA: 3 } },
    });
  });
});
