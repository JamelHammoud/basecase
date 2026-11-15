import { describe, expect, it } from 'vitest';
import { DEFAULT_PROJECT } from '../types/robotics';
import { applyBuildSettings } from './agentBuildRequests';

describe('set_build time budget', () => {
  it('sets, preserves, and clears hours without changing the money budget', () => {
    const project = { ...DEFAULT_PROJECT, budgetUsd: 100 };
    const { next } = applyBuildSettings(project, { budget_hours: 6 });

    expect(next.budgetHours).toBe(6);
    expect(next.budgetUsd).toBe(100);
    expect(applyBuildSettings(next, {}).next.budgetHours).toBe(6);
    expect(applyBuildSettings(next, { budget_hours: 0 }).next.budgetHours).toBeUndefined();
  });

  it.each([-1, NaN, Infinity])('refuses negative or nonfinite hours %s', (budget_hours) => {
    expect(applyBuildSettings(DEFAULT_PROJECT, { budget_hours }).next.budgetHours).toBeUndefined();
  });
});
