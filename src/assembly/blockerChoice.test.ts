import { describe, expect, it } from 'vitest';
import type { ScenePart } from '../types/robotics';
import { fewestBlockers, hookedBy, leastBlockedSplit } from './blockerChoice';
import { fastenerPlanningFixture, planningMoves } from './fastenerPlanning.fixtures';
import { lipLines, planLines, splitLines } from './planLines';
import { serviceDepths } from './serviceDepth';
import type { SplitPlane } from './splitTest';

function sortedLips(moves: ReturnType<typeof planningMoves>): string[] {
  const order = moves.local
    .map((blockers, i) => ({ solid: blockers.length, lips: moves.lips[i] }))
    .sort((a, b) => a.solid - b.solid);
  const fewest = order.filter((option) => option.solid === order[0].solid);

  return [...fewest].sort((a, b) => a.lips.length - b.lips.length)[0]?.lips ?? [];
}

function generator() {
  let seed = 8317;

  return (limit: number) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;

    return seed % limit;
  };
}

describe('assembly diagnostic choices', () => {
  it('matches stable sorted choices across ties, empty paths, edits and unchanged source arrays', () => {
    const next = generator();

    for (let trial = 0; trial < 500; trial++) {
      const paths = Array.from({ length: next(25) }, (_, i) =>
        Array.from({ length: next(8) }, (_, j) => `blocker-${i}-${j}`),
      );
      const moves = planningMoves(paths);

      moves.lips = paths.map((_, i) => Array.from({ length: next(8) }, (_, j) => `lip-${i}-${j}`));

      const planes: SplitPlane[] = ['x', 'y', 'z'].map((axis) => ({
        axis: axis as SplitPlane['axis'],
        blockers: [paths[next(Math.max(1, paths.length))] ?? [], paths[next(Math.max(1, paths.length))] ?? []],
      }));
      const before = structuredClone({ moves, planes });
      const expected = [...paths].sort((a, b) => a.length - b.length)[0];
      const split = [...planes].sort((a, b) => a.blockers.flat().length - b.blockers.flat().length)[0];

      expect(fewestBlockers(paths)).toEqual(expected ?? []);
      expect(hookedBy(moves)).toEqual(sortedLips(moves));
      expect(leastBlockedSplit(planes)).toBe(split);
      expect({ moves, planes }).toEqual(before);

      paths.unshift([]);
      moves.lips.unshift(['edited']);

      expect(fewestBlockers(paths)).toBe(paths[0]);
      expect(hookedBy(moves)).toEqual(sortedLips(moves));
    }
  });

  it('keeps the first tied direction and split in complete diagnostic lines and service results', () => {
    const f = fastenerPlanningFixture(0);
    const moves = planningMoves([
      ['other', 'unknown'],
      ['later', 'unknown'],
    ]);
    const stuck = { steps: [], screws: {}, stuckParts: ['battery', 'other', 'later'] };

    moves.lips = [['first-lip'], ['later-lip']];
    f.geometry.moves = { battery: moves, other: planningMoves([['battery']]), later: planningMoves([['battery']]) };

    const part = { id: 'battery', supplyId: 'lipo-3s-2200', name: 'Battery cover' } as ScenePart;
    const service = serviceDepths([part], f.geometry, () => '', stuck);
    const lines = planLines(stuck, f.geometry);
    const splits: SplitPlane[] = [
      { axis: 'z', blockers: [['other'], []] },
      { axis: 'x', blockers: [[], ['later']] },
      { axis: 'y', blockers: [['other'], ['later']] },
    ];
    const split = splitLines({ battery: splits }, new Map([[part.id, part]]), () => ['other']);

    expect(service).toEqual([
      { id: 'battery', cls: 'battery', steps: null, partsOut: [], screwsOut: [], blockedBy: ['other'] },
    ]);
    expect(lines[0].ids).toEqual(stuck.stuckParts);
    expect(lines[0].text).toContain('(in the way: other and battery)');
    expect(lipLines(f.geometry)[0]).toMatchObject({ ids: ['battery'], text: expect.stringContaining('first-lip') });
    expect(split[0]).toMatchObject({ ids: ['battery'], text: expect.stringContaining('front/back') });

    moves.exit = null;

    expect(serviceDepths([part], f.geometry, () => '', stuck)).toEqual(service);
  });

  it.each([300, 600])('reads every candidate count once at %i choices', (count) => {
    let reads = 0;
    const paths = Array.from(
      { length: count },
      (_, i) =>
        new Proxy(Array<string>(count - i).fill('blocker'), {
          get(target, key, receiver) {
            if (key === 'length') reads++;

            return Reflect.get(target, key, receiver);
          },
        }),
    );
    const moves = planningMoves(paths);

    moves.lips = paths;
    reads = 0;

    expect(fewestBlockers(paths)).toBe(paths[count - 1]);
    expect(reads).toBe(count);

    reads = 0;

    expect(hookedBy(moves)).toBe(paths[count - 1]);
    expect(reads).toBe(count * 2);

    const planes: SplitPlane[] = paths.map((path) => ({ axis: 'x', blockers: [path, path] }));

    reads = 0;

    expect(leastBlockedSplit(planes)).toBe(planes[count - 1]);
    expect(reads).toBe(count * 2);
  });
});
