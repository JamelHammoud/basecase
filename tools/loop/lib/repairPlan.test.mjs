import { describe, expect, it } from 'vitest';
import { repairPlan } from './repairPlan.mjs';

const plan = (change) =>
  repairPlan({
    run: { status: 'completed' },
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

  it('repairs the jobs that failed after the first repair started, once the Check finishes', () => {
    const later = { taken: ['unit'], repairOpen: () => true };

    expect(plan({ ...later, run: { status: 'in_progress' } }).wait).toMatch(/never saw/);
    expect(plan(later)).toEqual({ jobs: ['e2e (2)'] });
  });

  it('stops once every failed job has had a repair, whatever the gate job says', () => {
    expect(plan({ failed: ['unit', 'e2e (2)', 'check'], taken: ['unit', 'e2e (2)'] }).wait).toMatch(/every failed job/);
  });
});
