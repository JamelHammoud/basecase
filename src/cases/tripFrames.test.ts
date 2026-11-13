import { describe, expect, it } from 'vitest';
import { evaluateContract, type Contract, type Formula } from '../skills/contract';
import { tripFrames } from './tripFrames';

const below = (signal: string, value: number): Formula => ({
  eventually: { window: 'whole', state: { atom: { expr: { signal }, cmp: '<', value, scale: 1 } } },
});

const contract: Contract = {
  version: 1,
  success: below('reach', 0.1),
  failures: [
    { label: 'fell', formula: below('height', 0.2) },
    { label: 'dropped', formula: below('grip', 0) },
  ],
};

const height = Array.from({ length: 200 }, (_, i) => (i < 137 ? 0.5 : 0.1));
const trace = {
  dt: 0.02,
  signals: { reach: height.map(() => 1), height, grip: height.map(() => 1) },
};

describe('trip frames', () => {
  it('puts a failed label on the first frame evaluateContract reports it for', async () => {
    const trips = await tripFrames(contract, trace);
    const upTo = (frame: number) => ({
      dt: trace.dt,
      signals: Object.fromEntries(Object.entries(trace.signals).map(([k, s]) => [k, s.slice(0, frame + 1)])),
    });

    expect(trips).toEqual([{ label: 'fell', frame: 137 }]);
    expect((await evaluateContract(contract, upTo(137))).failed).toEqual(['fell']);
    expect((await evaluateContract(contract, upTo(136))).failed).toEqual([]);
  });

  it('marks nothing on a try with no failed labels', async () => {
    expect(
      await tripFrames(contract, { ...trace, signals: { ...trace.signals, height: height.map(() => 1) } }),
    ).toEqual([]);
  });
});
