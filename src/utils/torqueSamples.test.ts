import { describe, expect, it } from 'vitest';
import { jointSamples, outsideEnvelope, type TorqueSeries } from './peakTorque';
import type { ServoCurve } from './engineeringTypes';

const RPM = 60 / (2 * Math.PI);
const round = (value: number, step: number) => Math.round(value / step) * step;
const curve: ServoCurve = { rpm: 60, stallNm: 2, ratedNm: 1 };
const trace = (demand: number[], speed: number[]): TorqueSeries => ({
  windowS: 0.025,
  demand: [demand],
  speed: [speed],
  absDemand: [],
  sqForce: [],
});

function copiedSamples(series: TorqueSeries, settleS: number): Array<[number, number]> {
  const from = Math.ceil(settleS / series.windowS);
  const torque = series.demand?.[0].slice(from) ?? [];
  const speed = series.speed?.[0].slice(from) ?? [];

  return torque.flatMap((nm, i): Array<[number, number]> =>
    i % 2 === 0 && Number.isFinite(speed[i]) ? [[round(speed[i] * RPM, 0.1), round(nm, 0.001)]] : [],
  );
}

function filteredShare(samples: Array<[number, number]>, limits: ServoCurve) {
  const outside = samples.filter(
    ([rpm, nm]) => rpm * nm > 0 && Math.abs(nm) > limits.stallNm * Math.max(0, 1 - Math.abs(rpm) / limits.rpm),
  );

  return samples.length ? outside.length / samples.length : 0;
}

function counted(values: number[]) {
  let reads = 0;
  const data = new Proxy(values, {
    get(target, key, receiver) {
      if (typeof key === 'string' && /^\d+$/.test(key)) reads++;

      return Reflect.get(target, key, receiver);
    },
  });

  return { data, reads: () => reads };
}

describe('torque-speed sample extraction', () => {
  it('matches copied windows across channel lengths, settling boundaries and edited traces', () => {
    const offsets = [-Infinity, -3, -0.026, -0.025, -0.001, -0, 0, 0.001, 0.025, 0.026, 3, Infinity, NaN];

    for (let seed = 0; seed < 120; seed++) {
      const demand = Array.from({ length: seed % 31 }, (_, i) => Math.sin(i * 17 + seed) * 3);
      const speed = Array.from({ length: (seed * 7) % 37 }, (_, i) => Math.cos(i * 13 + seed) * 10);
      const series = trace(demand, speed);
      const before = structuredClone(series);

      for (const settleS of offsets) {
        const expected = copiedSamples(series, settleS);
        const samples = jointSamples(series, 0, settleS);

        expect(samples).toEqual(expected);
        expect(outsideEnvelope(samples, curve)).toBe(filteredShare(expected, curve));
      }

      expect(series).toEqual(before);
      demand[0] = -1.23456;
      speed[0] = 2.34567;

      expect(jointSamples(series, 0, 0)).toEqual(copiedSamples(series, 0));
    }
  });

  it('preserves sparse windows, nonfinite values, signed zero and independent results', () => {
    const demand = [-0, NaN, Infinity, -Infinity, NaN, 2, -0.0004, -2, 1];
    const speed = [-0, 1, NaN, Infinity, -Infinity, 1, 0.001, -2, 3];

    delete demand[4];
    delete speed[8];

    const series = trace(demand, speed);

    for (const settleS of [0, 0.025, -0.1, NaN]) {
      expect(jointSamples(series, 0, settleS)).toEqual(copiedSamples(series, settleS));
    }

    const first = jointSamples(series, 0, 0);

    expect(Object.is(first[0][0], -0)).toBe(true);
    expect(Object.is(first[0][1], -0)).toBe(true);
    first[0][0] = 100;

    expect(jointSamples(series, 0, 0)).toEqual(copiedSamples(series, 0));
    expect(jointSamples({ ...series, demand: undefined }, 0, 0)).toEqual([]);
    expect(jointSamples({ ...series, speed: undefined }, 0, 0)).toEqual([]);
  });

  it('keeps envelope boundaries, braking and sparse denominators', () => {
    const samples: Array<[number, number]> = [
      [30, 1],
      [30, 1.0001],
      [-30, -1.0001],
      [-30, 2],
      [0, 3],
      [60, 0.1],
      [Infinity, 1],
      [NaN, 2],
      [20, NaN],
      [-0, -0],
    ];

    delete samples[3];

    for (const limits of [curve, { ...curve, rpm: 0 }, { ...curve, stallNm: NaN }]) {
      expect(outsideEnvelope(samples, limits)).toBe(filteredShare(samples, limits));
    }

    expect(outsideEnvelope([], curve)).toBe(0);
  });

  it.each([300, 600])('reads only retained windows from a %i-window recording', (length) => {
    const demand = Array.from({ length }, (_, i) => i / 100);
    const speed = Array.from({ length }, (_, i) => i / 10);
    const oldDemand = counted(demand);
    const oldSpeed = counted(speed);
    const newDemand = counted(demand);
    const newSpeed = counted(speed);
    const expected = copiedSamples(trace(oldDemand.data, oldSpeed.data), 0);

    expect(jointSamples(trace(newDemand.data, newSpeed.data), 0, 0)).toEqual(expected);
    expect(oldDemand.reads() + oldSpeed.reads()).toBe(length * 2);
    expect(newDemand.reads() + newSpeed.reads()).toBe(length);
  });
});
