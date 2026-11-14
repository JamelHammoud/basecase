import { describe, expect, it } from 'vitest';
import type { StoredTry } from '../../cases/storedTry';
import { matchingTries, pagedGroups, robotGroups, tryMatches } from './triesSearch';

const stored = (id: string, robot: string, at: string, extra: Partial<StoredTry> = {}): StoredTry => ({
  version: 1,
  id,
  sceneId: 'scene-a',
  robot: { name: robot, modelHash: 'm', joints: [] },
  case: { id: 'touch', name: 'Touch a Point', hash: 'h', contractHash: 'c' },
  source: 'case',
  input: null,
  at,
  seconds: 3,
  rate: 50,
  frames: 150,
  outcome: { result: 'passed', margin: 1 },
  seed: 0,
  sourceTry: null,
  faults: [],
  ...extra,
});

const scenes = new Map([['scene-a', 'Desk Arm']]);

describe('tryMatches', () => {
  it('matches every try without a query', () => {
    expect(tryMatches(stored('a', 'Arm', '1'), '  ', scenes)).toBe(true);
  });

  it('matches the Case name, robot name, source and scene name, ignoring case', () => {
    const t = stored('a', 'SO-101 Arm', '1', { source: 'real' });

    expect(tryMatches(t, 'touch', scenes)).toBe(true);
    expect(tryMatches(t, 'so-101', scenes)).toBe(true);
    expect(tryMatches(t, 'REAL', scenes)).toBe(true);
    expect(tryMatches(t, 'desk', scenes)).toBe(true);
    expect(tryMatches(t, 'walk', scenes)).toBe(false);
  });

  it('skips a scene it has no name for and a try without a Case', () => {
    const t = stored('a', 'Arm', '1', { sceneId: 'gone', case: null });

    expect(tryMatches(t, 'desk', scenes)).toBe(false);
    expect(matchingTries([t, stored('b', 'Arm', '2')], 'desk', scenes).map((m) => m.id)).toEqual(['b']);
  });
});

describe('robotGroups', () => {
  const tries = [
    stored('a1', 'Arm', '2026-01-01'),
    stored('d1', 'Dog', '2026-01-03'),
    stored('a2', 'Arm', '2026-01-02'),
  ];

  it('groups by robot, newest robot and newest try first', () => {
    expect(robotGroups(tries).map((g) => [g.robot, g.tries.map((t) => t.id)])).toEqual([
      ['Dog', ['d1']],
      ['Arm', ['a2', 'a1']],
    ]);
  });

  it('puts the focused robot first', () => {
    expect(robotGroups(tries, 'Arm').map((g) => g.robot)).toEqual(['Arm', 'Dog']);
  });

  it('pages across groups', () => {
    const groups = robotGroups(tries);

    expect(pagedGroups(groups, 2).map((g) => g.tries.map((t) => t.id))).toEqual([['d1'], ['a2']]);
    expect(pagedGroups(groups, 1).map((g) => g.robot)).toEqual(['Dog']);
  });
});
