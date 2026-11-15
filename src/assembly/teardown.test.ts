import { describe, expect, it } from 'vitest';
import type { AssemblyGeometry, PartMoves } from './assemblyGeometry';
import type { FastenerChain } from './assemblyTypes';
import type { RemovalPlan } from './removalOrder';
import { teardownTo } from './serviceDepth';

const moves = (ways: string[][]): PartMoves => ({
  dirs: ways.map(() => [0, 1, 0]),
  local: ways,
  exit: ways,
  lips: ways.map(() => []),
  captured: false,
  contents: [],
});

const geometry = (ways: Record<string, string[][]>): AssemblyGeometry => ({
  chains: { screws: [], sleeves: [] },
  moves: Object.fromEntries(Object.entries(ways).map(([id, paths]) => [id, moves(paths)])),
  drivers: {},
  splits: {},
  fits: { insertWalls: {}, leadRoomMm: {} },
  timedOut: false,
  ms: 0,
});

const removal = (ids: string[]): RemovalPlan => ({
  steps: ids.map((id) => ({ kind: 'part', ids: [id] })),
  screws: {},
  stuckParts: [],
});

const chain = (id: string, stack: string[]): FastenerChain => ({
  id,
  stack,
  d: 3,
  axis: [0, 1, 0],
  tip: [0, 0, 0],
  top: [0, 10, 0],
  headR: 3,
  endsIn: { kind: 'printed' },
  engagementMm: 5,
  needMm: 3,
  problems: [],
});

function validSubset(g: AssemblyGeometry, plan: RemovalPlan, selected: Set<string>, target: string): boolean {
  const removed = new Set<string>();

  for (const step of plan.steps) {
    const id = step.ids[0];

    if (!selected.has(id)) continue;

    const paths = id === target ? g.moves[id].exit! : g.moves[id].local;

    if (!paths.some((path) => path.every((blocker) => removed.has(blocker)))) return false;

    removed.add(id);

    if (id === target) return true;
  }

  return false;
}

function exhaustiveMinimum(g: AssemblyGeometry, plan: RemovalPlan, target: string): number {
  const ids = plan.steps.flatMap((step) => step.ids);
  let best = Infinity;

  for (let mask = 0; mask < 2 ** ids.length; mask++) {
    const selected = new Set(ids.filter((_, i) => (mask & (1 << i)) !== 0));

    if (selected.has(target) && validSubset(g, plan, selected, target)) best = Math.min(best, selected.size);
  }

  return best;
}

describe('repair teardown', () => {
  it('excludes unrelated earlier removals and compares complete dependency costs', () => {
    const g = geometry({
      unrelated: [[]],
      a: [[]],
      b: [['a']],
      c: [['b']],
      d: [[]],
      e: [[]],
      target: [['c'], ['d', 'e']],
    });
    const plan = removal(Object.keys(g.moves));

    expect(teardownTo(plan, 'target', g)).toEqual(new Set(['d', 'e', 'target']));
    expect(teardownTo(plan, 'target', g)!.size).toBeGreaterThan(teardownTo(plan, 'unrelated', g)!.size);
  });

  it('retains alternatives whose shared blockers make the combined path shortest', () => {
    const g = geometry({
      shared: [[]],
      left: [[]],
      right: [[]],
      a: [['left'], ['shared']],
      b: [['right'], ['shared']],
      target: [['a', 'b']],
    });
    const plan = removal(Object.keys(g.moves));
    const selected = teardownTo(plan, 'target', g)!;

    expect(selected).toEqual(new Set(['shared', 'a', 'b', 'target']));
    expect(selected.size).toBe(exhaustiveMinimum(g, plan, 'target'));
    expect(validSubset(g, plan, selected, 'target')).toBe(true);
  });

  it('matches exhaustive valid subsequences for every pair of target exit alternatives', () => {
    const blockers = [[], ['a'], ['b'], ['c'], ['a', 'c'], ['b', 'd']];

    for (const first of blockers) {
      for (const second of blockers) {
        const g = geometry({ a: [[]], b: [['a']], c: [[]], d: [['b'], ['c']], target: [first, second] });
        const plan = removal(Object.keys(g.moves));
        const selected = teardownTo(plan, 'target', g)!;

        expect(selected.size).toBe(exhaustiveMinimum(g, plan, 'target'));
        expect(validSubset(g, plan, selected, 'target')).toBe(true);
      }
    }
  });

  it('rejects missing measurements, incomplete searches and exits blocked later in the proven order', () => {
    const g = geometry({ target: [['later']], later: [[]] });
    const plan = removal(['target', 'later']);

    expect(teardownTo(plan, 'target', g)).toBeNull();
    expect(teardownTo(plan, 'missing', g)).toBeNull();
    expect(teardownTo(plan, 'later', { ...g, timedOut: true })).toBeNull();
    expect(
      teardownTo(plan, 'target', { ...g, moves: { ...g.moves, target: { ...g.moves.target, exit: null } } }),
    ).toBeNull();
  });

  it('does not treat a member of a pinned unit as a separately removable replacement', () => {
    const g = geometry({ a: [['b']], b: [['a']] });
    const plan: RemovalPlan = { steps: [{ kind: 'unit', ids: ['a', 'b'] }], screws: {}, stuckParts: [] };

    expect(teardownTo(plan, 'a', g)).toBeNull();
  });

  it('requires the target fasteners, chooses a clear driver and carries hosted sleeves', () => {
    const g = geometry({ cover: [[]], target: [[]] });

    g.chains.screws = [chain('bolt', ['target'])];
    g.chains.sleeves = [
      { id: 'washer', kind: 'washer', host: 'target', screw: 'bolt' },
      { id: 'insert', kind: 'insert', host: 'target', screw: 'bolt' },
    ];
    g.drivers.bolt = [
      { tool: 'straight', blockers: ['cover'] },
      { tool: 'L-key', blockers: [] },
    ];

    const plan: RemovalPlan = {
      steps: [
        { kind: 'part', ids: ['cover'] },
        { kind: 'screw', ids: ['bolt', 'washer'] },
        { kind: 'part', ids: ['target', 'insert'] },
      ],
      screws: { bolt: { verdict: 'tool', tool: 'L-key' } },
      stuckParts: [],
    };

    expect(teardownTo(plan, 'target', g)).toEqual(new Set(['bolt', 'washer', 'target', 'insert']));
    expect(teardownTo(plan, 'target', { ...g, drivers: {} })).toBeNull();
  });

  it('keeps a removable blocker unit and its internal fasteners intact', () => {
    const g = geometry({
      a: Array.from({ length: 6 }, () => ['b']),
      b: Array.from({ length: 6 }, () => ['a']),
      target: [['a']],
    });

    g.chains.screws = [chain('internal', ['a', 'b'])];

    const plan: RemovalPlan = {
      steps: [
        { kind: 'unit', ids: ['a', 'b', 'internal'] },
        { kind: 'part', ids: ['target'] },
      ],
      screws: {},
      stuckParts: [],
    };

    expect(teardownTo(plan, 'target', g)).toEqual(new Set(['a', 'b', 'internal', 'target']));
  });
});
