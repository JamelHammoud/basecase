import { describe, expect, it } from 'vitest';
import { sameTitle, verdictOf } from './github.mjs';

describe('sameTitle', () => {
  it.each([
    [
      'Update: Move the agent adapters to their latest releases',
      'Update: Move the agent adapters to their latest releases',
    ],
    ['Refine: Trim the inspector', 'refine:  trim the inspector.'],
  ])('treats %s and %s as one', (a, b) => {
    expect(sameTitle(a, b)).toBe(true);
  });

  it('tells different work apart', () => {
    expect(sameTitle('Feature: Import from Onshape', 'Feature: Import from Fusion')).toBe(false);
  });
});

describe('verdictOf', () => {
  const run = (status, conclusion, id) => ({ status, conclusion, databaseId: id });

  it('takes the newest finished run, skipping cancelled ones', () => {
    const runs = [run('completed', 'cancelled', 3), run('completed', 'failure', 2), run('completed', 'success', 1)];

    expect(verdictOf(runs, () => false)?.databaseId).toBe(2);
  });

  it('counts a failed job in a cancelled run, and has no verdict when nothing ran', () => {
    const runs = [run('completed', 'cancelled', 7), run('completed', 'cancelled', 6)];

    expect(verdictOf(runs, (r) => r.databaseId === 6)).toMatchObject({ databaseId: 6, conclusion: 'failure' });
    expect(verdictOf(runs, () => false)).toBeNull();
  });

  it('calls main red as soon as a job fails in a run still waiting on others', () => {
    const runs = [run('queued', null, 5), run('completed', 'success', 4)];

    expect(verdictOf(runs, (r) => r.databaseId === 5)).toMatchObject({ databaseId: 5, conclusion: 'failure' });
    expect(verdictOf(runs, () => false)?.databaseId).toBe(4);
  });
});
