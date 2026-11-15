import { describe, expect, it } from 'vitest';
import type { AssemblyGeometry, PartMoves } from './assemblyGeometry';
import { planningMoves, planningScrew } from './fastenerPlanning.fixtures';
import { planRemoval } from './removalOrder';
import { mutualRemovalUnits } from './removalUnits';

function geometry(moves: Record<string, PartMoves>): AssemblyGeometry {
  return {
    moves,
    chains: { screws: [], sleeves: [] },
    drivers: {},
    splits: {},
    fits: { insertWalls: {}, leadRoomMm: {} },
    timedOut: false,
    ms: 0,
  };
}

function exhaustivePairs(moves: Record<string, PartMoves>, ids = Object.keys(moves)): string[][] {
  const pairs: string[][] = [];
  const blocks = (a: string, b: string) => moves[a].local.some((path) => path.includes(b));

  for (const a of ids) for (const b of ids) if (a < b && blocks(a, b) && blocks(b, a)) pairs.push([a, b]);

  return pairs;
}

function pairFixture(count: number) {
  let reads = 0;
  const ids = Array.from({ length: count }, (_, i) => `part-${i}`);
  const moves = Object.fromEntries(
    ids.map((id, i) => {
      const move = planningMoves(Array.from({ length: 6 }, () => [ids[i ^ 1]]));
      const local = move.local;

      Object.defineProperty(move, 'local', {
        get() {
          reads++;

          return local;
        },
      });

      return [id, move];
    }),
  );

  return { geometry: geometry(moves), ids, reads: () => reads };
}

describe('mutual removal units', () => {
  it('matches every directed three-part graph in source order, with duplicate, self and unknown blockers', () => {
    const ids = ['z', '10', '2'];
    const edges = ids.flatMap((a) => ids.filter((b) => a !== b).map((b) => [a, b]));

    for (let mask = 0; mask < 2 ** edges.length; mask++) {
      const moves = Object.fromEntries(ids.map((id) => [id, planningMoves([[id, 'unknown'], []])]));

      edges.forEach(([a, b], i) => {
        if ((mask & (1 << i)) !== 0) moves[a].local[i % 2].push(b, b);
      });

      const before = structuredClone(moves);
      const remaining = Object.keys(moves).slice(1);

      expect(mutualRemovalUnits(moves)).toEqual(exhaustivePairs(moves));
      expect(mutualRemovalUnits(moves, remaining)).toEqual(exhaustivePairs(moves, remaining));
      expect(moves).toEqual(before);
    }

    expect(mutualRemovalUnits({})).toEqual([]);
  });

  it.each([150, 300])('plans %i interlocked parts without rescanning every possible pair', (count) => {
    const f = pairFixture(count);
    const expected = exhaustivePairs(f.geometry.moves).map((ids) => ({ kind: 'unit', ids }));
    const before = f.reads();
    const plan = planRemoval(f.geometry, {});

    expect(plan).toEqual({ steps: expected, screws: {}, stuckParts: [] });
    expect(f.reads() - before).toBeLessThanOrEqual((count * count) / 4 + count * 8);
  });

  it('keeps group priority, carries hosted hardware and rebuilds pairs after an edit', () => {
    const g = geometry({
      z: planningMoves(Array.from({ length: 6 }, () => ['a'])),
      a: planningMoves(Array.from({ length: 6 }, () => ['z'])),
      y: planningMoves(Array.from({ length: 6 }, () => ['b'])),
      b: planningMoves(Array.from({ length: 6 }, () => ['y'])),
    });

    g.chains.screws = [planningScrew('internal', ['b', 'y'])];
    g.chains.sleeves = [{ id: 'washer', kind: 'washer', host: 'b', screw: 'internal' }];
    g.drivers.internal = [{ tool: 'straight', blockers: ['b', 'y'] }];

    const before = structuredClone(g);
    const groups = { b: 'group', y: 'group' };
    const plan = planRemoval(g, groups);

    expect(plan.steps).toEqual([
      { kind: 'unit', ids: ['y', 'b', 'internal', 'washer'] },
      { kind: 'unit', ids: ['a', 'z'] },
    ]);
    expect(plan.stuckParts).toEqual([]);
    expect(plan.screws.internal).toEqual({ verdict: 'tool', tool: 'L-key' });
    expect(g).toEqual(before);

    g.moves.a = planningMoves(Array.from({ length: 6 }, () => ['a']));

    expect(planRemoval(g, groups).stuckParts).toEqual(['z', 'a']);
    expect(g.moves.z).toEqual(before.moves.z);
  });
});
