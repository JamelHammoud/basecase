import { describe, expect, it } from 'vitest';
import { traceRange, xRange, type Range, type Trace } from './tracePaths';

const trace = (values: ArrayLike<number>, x?: ArrayLike<number>): Trace => ({
  id: 'signal',
  tone: 'primary',
  values,
  x,
});

describe.each([
  { axis: 'y', rangeOf: traceRange, series: (values: ArrayLike<number>) => trace(values) },
  { axis: 'x', rangeOf: xRange, series: (values: ArrayLike<number>) => trace([1000], values) },
])('$axis trace range', ({ rangeOf, series }) => {
  it.each<{ values: number[]; extra: number[]; want: Range }>([
    { values: [], extra: [], want: [-1, 1] },
    { values: [NaN, Infinity, -Infinity], extra: [NaN, Infinity], want: [-1, 1] },
    { values: [NaN, Infinity], extra: [-7, 2], want: [-7, 2] },
    { values: [-2, 4, 1], extra: [-5, 8, NaN], want: [-5, 8] },
    { values: [0, -0], extra: [], want: [-0.1, 0.1] },
    { values: [-5, -5, NaN], extra: [], want: [-5.5, -4.5] },
    { values: [10], extra: [], want: [9, 11] },
    { values: [0.25], extra: [], want: [0.15, 0.35] },
  ])('keeps finite bounds and flat-value padding for $values with $extra', ({ values, extra, want }) => {
    Object.freeze(extra);

    expect(rangeOf([series(Object.freeze(values))], extra)).toEqual(want);
  });

  it('combines ordinary arrays, typed-array views and array-like samples without changing them', () => {
    const backing = new Float64Array([-1000, 5, NaN, -8, 1000]);
    const view = backing.subarray(1, 4);
    const samples = Object.freeze({ 0: 12, 1: -3, length: 2 });
    const traces = [series(Object.freeze([2, -1])), series(view), series(samples)];

    expect(rangeOf(traces)).toEqual([-8, 12]);
    expect([...backing]).toEqual([-1000, 5, NaN, -8, 1000]);
    expect(samples).toEqual({ 0: 12, 1: -3, length: 2 });
  });

  it('reads each source sample once across a long multi-trace recording', () => {
    let reads = 0;
    const length = 6001;
    const samples = new Proxy<ArrayLike<number>>(
      { length },
      {
        get(target, key) {
          if (key === 'length') return target.length;

          if (typeof key !== 'string' || !/^\d+$/.test(key)) return undefined;

          reads++;

          return Number(key) - 3000;
        },
      },
    );
    const traces = Array.from({ length: 8 }, () => series(samples));

    expect(rangeOf(traces, [-4000, 4000])).toEqual([-4000, 4000]);
    expect(reads).toBe(length * traces.length);
  });
});

it('takes x bounds only from traces with x samples, plus explicit bounds', () => {
  const traces = [trace([-1000, 1000]), trace([5, 6], [NaN, -3, 9]), trace([0], [])];

  expect(xRange(traces, [0])).toEqual([-3, 9]);
  expect(xRange([traces[0]])).toEqual([-1, 1]);
  expect(traceRange(traces)).toEqual([-1000, 1000]);
});
