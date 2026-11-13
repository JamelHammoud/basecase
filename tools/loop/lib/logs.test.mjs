import { describe, expect, it } from 'vitest';
import { errorKey, inWindow, laneHealth, lanesHealth, outcomeOf, parseLog, runMinutes } from './logs.mjs';

const LOG = [
  '2026-11-13T05:00:00.000Z [build-1] no step waiting',
  '2026-11-13T05:01:00.000Z [build-1] no step waiting',
  "2026-11-13T05:02:00.000Z [build-2] failed: Error: git worktree add -q -b failed (exit 255): fatal: a branch named 'loop/build/x-1' already exists",
  '',
  '    at run (file:///tools/loop/lib/sh.mjs:19:11)',
  '2026-11-13T05:21:00.000Z [build-1] #12: opened https://github.com/o/r/pull/40',
  '2026-11-13T05:22:00.000Z [build-2] #13 not built: Blocked on #12',
  "2026-11-13T05:23:00.000Z [build-2] failed: Error: git worktree add -q -b failed (exit 255): fatal: a branch named 'loop/build/y-2' already exists",
].join('\n');

describe('parseLog', () => {
  it('reads each entry with its lane and slot, and folds a stack trace into the entry above it', () => {
    const entries = parseLog(LOG);

    expect(entries).toHaveLength(6);
    expect(entries[2]).toMatchObject({ lane: 'build', slot: 'build-2', outcome: 'crash' });
    expect(entries[2].message).toContain('at run');
  });

  it('gives an entry without a slot the first slot', () => {
    expect(parseLog('2026-11-13T05:00:00.000Z [lead] no reason to plan')[0].slot).toBe('lead-1');
  });
});

describe('outcomeOf', () => {
  it.each([
    ['failed: Error: boom', 'crash'],
    ['#4: review session failed: timeout', 'session failed'],
    ['main is red; waiting for a repair that turns Check green', 'waiting'],
    ['#93 not built: Blocked on #92', 'declined'],
    ['no change: nothing worth refining', 'declined'],
    ['nothing to review', 'idle'],
    ['12 ideas wait for the lead; not adding more', 'idle'],
    ['#195: review of c5c74f4 carried over (success); only main changed', 'idle'],
    ['merged #77: Refine: Drop the status line', 'worked'],
    ['took 14 min', 'took'],
  ])('of %j is %s', (message, outcome) => {
    expect(outcomeOf(message)).toBe(outcome);
  });
});

describe('errorKey', () => {
  it('groups the same failure across branches and numbers', () => {
    const [first, second] = parseLog(LOG).filter((e) => e.outcome === 'crash');

    expect(errorKey(first.message)).toBe(errorKey(second.message));
    expect(errorKey(first.message)).toBe(
      'Error: git worktree add -q -b failed (exit N): fatal: a branch named … already exists',
    );
  });
});

describe('laneHealth', () => {
  it('counts crashes per run and the share of runs with nothing to do', () => {
    const health = laneHealth(parseLog(LOG));

    expect(health).toMatchObject({ runs: 6, worked: 1, declined: 1, idle: 2, crashes: 2, sessionFailures: 0 });
    expect(health.crashRate).toBeCloseTo(2 / 6);
    expect(health.idleRatio).toBeCloseTo(2 / 6);
    expect(health.errors).toEqual([
      ['Error: git worktree add -q -b failed (exit N): fatal: a branch named … already exists', 2],
    ]);
  });

  it('counts a red main as waiting, part of the nothing-to-do share', () => {
    const health = laneHealth(
      parseLog(
        [
          '2026-11-13T05:00:00.000Z [merge-1] main is red; waiting for a repair that turns Check green',
          '2026-11-13T05:01:00.000Z [merge-1] merged #7: Fix: a thing',
        ].join('\n'),
      ),
    );

    expect(health).toMatchObject({ waiting: 1, worked: 1, idleRatio: 0.5, crashRate: 0 });
  });

  it('reports zero rates for an empty log', () => {
    expect(laneHealth([])).toMatchObject({
      runs: 0,
      crashRate: 0,
      idleRatio: 0,
      medianMinutes: null,
      maxMinutes: null,
    });
  });
});

describe('runMinutes', () => {
  it('estimates a working run from the gap since its slot last logged, skipping quick runs', () => {
    expect(runMinutes(parseLog(LOG))).toEqual([20, 20]);
  });

  it('uses the runner’s took lines when there are any', () => {
    const entries = parseLog(
      ['2026-11-13T05:00:00.000Z [refine-1] opened x', '2026-11-13T05:00:00.000Z [refine-1] took 31 min'].join('\n'),
    );

    expect(runMinutes(entries)).toEqual([31]);
    expect(laneHealth(entries).runs).toBe(1);
  });
});

describe('lanesHealth', () => {
  it('ranks lanes by crash rate within the window', () => {
    const entries = parseLog(
      [
        '2026-11-01T00:00:00.000Z [merge-1] failed: old',
        '2026-11-13T05:00:00.000Z [merge-1] nothing ready to merge',
        '2026-11-13T05:00:00.000Z [update-1] failed: Error: HTTP 504',
      ].join('\n'),
    );
    const lanes = lanesHealth(inWindow(entries, { from: '2026-11-06T00:00:00Z', to: '2026-11-14T00:00:00Z' }));

    expect(lanes.map((l) => [l.lane, l.crashes])).toEqual([
      ['update', 1],
      ['merge', 0],
    ]);
  });
});
