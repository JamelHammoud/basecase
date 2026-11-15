import { describe, expect, it } from 'vitest';
import { assertTrainingImagesBudget } from './trainingImagesBudget.mjs';

const result = () => ({
  frames: 1000,
  width: 640,
  height: 480,
  milliseconds: 119999,
  measured: Array.from({ length: 500 }, () => ({ position: [0, 150, 0], bounds: [286, 223, 354, 257] })),
});

describe('training image benchmark contract', () => {
  it('accepts the complete run inside the timing and accuracy budgets', () => {
    expect(() => assertTrainingImagesBudget(result())).not.toThrow();
  });

  it.each([{ frames: 999 }, { width: 320 }, { height: 240 }, { milliseconds: 120000 }, { milliseconds: NaN }])(
    'refuses an incomplete or over-budget run: %j',
    (patch) => {
      expect(() => assertTrainingImagesBudget({ ...result(), ...patch })).toThrow();
    },
  );

  it('checks all 500 measured boxes, including the last one', () => {
    const run = result();

    run.measured[499].bounds[3] += 2;
    expect(() => assertTrainingImagesBudget(run)).toThrow();
    expect(() => assertTrainingImagesBudget({ ...result(), measured: result().measured.slice(0, 499) })).toThrow();
  });

  it('refuses an invisible measured block', () => {
    const run = result();

    run.measured[499].bounds = null;
    expect(() => assertTrainingImagesBudget(run)).toThrow();
  });
});
