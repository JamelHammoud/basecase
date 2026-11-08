import { describe, expect, it } from 'vitest';
import { newestRuns } from './newestRuns';

describe('newest readiness run', () => {
  it('an older run that finishes after the newest one has lost', () => {
    const runs = newestRuns();
    const a = runs.begin();
    const b = runs.begin();

    expect(b.isNewest()).toBe(true);
    expect(a.isNewest()).toBe(false);
  });

  it('a lone run is the newest', () => {
    expect(newestRuns().begin().isNewest()).toBe(true);
  });
});
