import { describe, expect, it } from 'vitest';
import type { Contract } from './contract';
import { liveGoal, type LiveGoal } from './liveGoal';
import type { ProbeReader } from './probes';

const above = (value: number) => ({ atom: { expr: { signal: 'x' }, cmp: '>' as const, value, scale: 1 } });

const contract: Contract = {
  version: 1,
  success: { eventually: { window: 'whole', state: above(100) } },
  failures: [
    { label: 'went past 50', formula: { eventually: { window: 'whole', state: above(50) } } },
    { label: 'dropped below 0', formula: { eventually: { window: 'whole', state: { not: above(0) } } } },
  ],
};

const reader = (): ProbeReader & { seen: number[] } => {
  const seen: number[] = [];

  return {
    seen,
    sample(poses, out) {
      seen.push(poses[0]);
      out.x = [...(out.x ?? []), poses[0]];
    },
  };
};

const failed = async (goal: LiveGoal) => (await goal.judge())?.failed ?? [];

describe('the live goal', () => {
  it('lists nothing before a try has two samples', async () => {
    const goal = liveGoal(contract, reader());

    expect(await failed(goal)).toEqual([]);
    goal.add(3, Float64Array.of(70));
    expect(await failed(goal)).toEqual([]);
  });

  it('samples at the record rate from the first frame, repeating the newest pose across gaps', () => {
    const probes = reader();
    const goal = liveGoal(contract, probes);

    goal.add(10, Float64Array.of(1));
    goal.add(10.05, Float64Array.of(2));
    goal.add(10.06, Float64Array.of(3));
    goal.add(10.1, Float64Array.of(4));

    expect(probes.seen).toEqual([1, 2, 2, 3, 4, 4]);
    expect(goal.probes()).toEqual({ x: 4 });
  });

  it('names each failure as soon as it happens, so far into the try', async () => {
    const goal = liveGoal(contract, reader());

    goal.add(0, Float64Array.of(10));
    goal.add(0.5, Float64Array.of(20));
    expect(await failed(goal)).toEqual([]);

    goal.add(1, Float64Array.of(60));
    expect(await failed(goal)).toEqual(['went past 50']);
    expect(await goal.judge()).toMatchObject({ passed: false });
  });
});
