import { describe, expect, it } from 'vitest';
import type { NamedFailure } from '../skills/contract';
import { OperateConditions, type ConditionSample } from './operateConditions';

const state = { atom: { expr: { signal: 'volts' }, cmp: '<' as const, value: 7, scale: 1 } };
const failure: NamedFailure = { label: 'Supply low', formula: { hold_for: { seconds: 1, state, within: 'whole' } } };
const sample = (at: number, volts: number | null = 6): ConditionSample => ({
  at,
  now: at,
  signals: volts === null ? {} : { volts },
});

describe('Operate Case conditions', () => {
  it('uses Case contract predicates on supplied voltage with sustained and transient conditions', async () => {
    const run = new OperateConditions([failure]);

    expect(await run.sample(sample(0))).toEqual([null]);
    expect(await run.sample(sample(400))).toEqual([null]);
    expect(await run.sample(sample(800))).toEqual([null]);
    expect(await run.sample(sample(1000))).toEqual([true]);
    expect(await run.sample(sample(1100, 8))).toEqual([false]);
    expect(await run.sample(sample(1200))).toEqual([null]);
    expect(await run.sample(sample(1300, 8))).toEqual([false]);
  });

  it('resets continuity on stale or missing telemetry without declaring recovery', async () => {
    const run = new OperateConditions([failure]);

    await run.sample(sample(0));
    await run.sample(sample(400));
    expect(await run.sample(sample(1000))).toEqual([null]);
    expect(await run.sample({ at: 1100, now: 2000, signals: { volts: 8 } })).toEqual([null]);
    expect(await run.sample(sample(2100, null))).toEqual([null]);
    expect(await run.sample(sample(2200, 7))).toEqual([false]);
  });

  it('rejects reordered and duplicate samples and never counts them toward duration', async () => {
    const run = new OperateConditions([failure]);

    await run.sample(sample(100));
    await run.sample(sample(500));
    expect(await run.sample(sample(400, 8))).toEqual([null]);
    expect(await run.sample(sample(500, 8))).toEqual([null]);
    await run.sample(sample(900));
    expect(await run.sample(sample(1100))).toEqual([true]);
  });
});

describe('instantaneous Case predicates', () => {
  it('uses the contract margin for an immediate voltage rule and preserves unknown under negation', async () => {
    const run = new OperateConditions([{ label: 'Supply low', formula: { eventually: { window: 'whole', state } } }]);
    const inverse = new OperateConditions([
      { label: 'Supply high', formula: { always: { window: 'whole', state: { not: state } } } },
    ]);

    expect(await run.sample(sample(0))).toEqual([true]);
    expect(await inverse.sample(sample(0, null))).toEqual([null]);
    expect(await run.sample(sample(100, 7))).toEqual([false]);
    expect(await run.sample(sample(200))).toEqual([true]);
  });
});
