import { describe, expect, it } from 'vitest';
import { sameTitle, similarTitle, stuckRuns, verdictOf } from './github.mjs';

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

describe('similarTitle', () => {
  it.each([
    [
      'Open a Case as a Command Center with the robot, its cameras, the operator camera, joints and tries in one window',
      'Open a Case in a Command Center showing the robot, its cameras, joints and tries',
    ],
    [
      'Feature: Number each servo as you plug it in, with the canvas lighting its joint',
      'Number each servo as it is plugged in, lighting its joint on the canvas',
    ],
  ])('treats %s and %s as the same work', (a, b) => {
    expect(similarTitle(a, b)).toBe(true);
  });

  it.each([
    ['Feature: Import from Onshape', 'Feature: Import from Fusion'],
    [
      'Drive any robot from live inputs, starting with arm and hand pose from the camera',
      'Open a Case as a Command Center with the robot and its cameras',
    ],
    ['Simulate catalog LiDARs from their spec rows', 'Import a scanned room as a Case world at true size'],
  ])('tells %s and %s apart', (a, b) => {
    expect(similarTitle(a, b)).toBe(false);
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

describe('stuckRuns', () => {
  it('picks unfinished runs over an hour old', () => {
    const now = Date.parse('2026-11-13T08:00:00Z');
    const runs = [
      { databaseId: 1, status: 'queued', createdAt: '2026-11-13T06:24:00Z' },
      { databaseId: 2, status: 'in_progress', createdAt: '2026-11-13T07:30:00Z' },
      { databaseId: 3, status: 'completed', createdAt: '2026-11-13T05:00:00Z' },
    ];

    expect(stuckRuns(runs, now).map((r) => r.databaseId)).toEqual([1]);
  });
});
