import { describe, expect, it } from 'vitest';
import type { TrySummary } from '../cases/tryFile';
import { tryGroups } from './useTriesView';

const summary = (id: string, robot: string, startedAt: string): TrySummary => ({
  id,
  robot,
  startedAt,
  sceneId: 'scene',
  modelHash: 'model',
  caseId: null,
  caseName: null,
  source: 'import',
  input: null,
  seconds: 1,
  frames: 50,
  outcome: { verdict: 'unjudged', margin: null },
  seed: 0,
  sourceTry: null,
  origin: null,
  task: null,
  recording: true,
  strip: false,
});

describe('shared Library, Tries and dataset grouping', () => {
  it('orders robots and their tries without changing stored order or equal-time order', () => {
    const oldRover = summary('old', 'Rover', '2026-11-01');
    const arm = summary('arm', 'Arm', '2026-11-03');
    const firstRover = summary('first', 'Rover', '2026-11-02');
    const secondRover = summary('second', 'Rover', '2026-11-02');
    const tries = [oldRover, arm, firstRover, secondRover];
    const before = [...tries];

    tries.forEach(Object.freeze);
    Object.freeze(tries);

    const groups = tryGroups(tries);

    expect(groups).toEqual([
      { robot: 'Arm', tries: [arm] },
      { robot: 'Rover', tries: [firstRover, secondRover, oldRover] },
    ]);
    expect(groups[1].tries[0]).toBe(firstRover);
    expect(tries).toEqual(before);
    groups[1].tries.pop();
    expect(tryGroups(tries)[1].tries).toEqual([firstRover, secondRover, oldRover]);
    expect(tryGroups([])).toEqual([]);
  });
});
