import { describe, expect, it } from 'vitest';
import { plannedLine } from './leadPlan.mjs';

describe('telling a request what it became', () => {
  it('names every step in one line', () => {
    expect(plannedLine([482])).toBe('Planned as #482.');
    expect(plannedLine([482, 483])).toBe('Planned as #482 and #483.');
    expect(plannedLine([482, 483, 484, 485])).toBe('Planned as #482, #483, #484 and #485.');
  });
});
