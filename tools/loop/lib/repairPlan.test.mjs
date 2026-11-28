import { describe, expect, it } from 'vitest';
import { repairPlan } from './repairPlan.mjs';

const plan = (change) =>
  repairPlan({
    failed: ['unit', 'e2e (2)'],
    taken: [],
    repairOpen: () => false,
    ...change,
  });

describe('repairPlan', () => {
  it('repairs every failed job of a Check no repair has seen', () => {
    expect(plan({})).toEqual({ jobs: ['unit', 'e2e (2)'] });
  });

  it('waits on an open repair for an earlier Check', () => {
    expect(plan({ repairOpen: () => true }).wait).toMatch(/already open/);
  });

  it('repairs newly failed jobs without waiting for unfinished jobs', () => {
    expect(plan({ taken: ['unit'] })).toEqual({ jobs: ['e2e (2)'] });
  });

  it('coordinates late failures with an open repair too', () => {
    expect(plan({ taken: ['unit'], repairOpen: () => true }).wait).toMatch(/already open/);
  });

  it('stops once every failed job has had a repair, whatever the gate job says', () => {
    expect(plan({ failed: ['unit', 'e2e (2)', 'check'], taken: ['unit', 'e2e (2)'] }).wait).toMatch(/every failed job/);
  });
});
