import { describe, expect, it } from 'vitest';
import type { TrySummary } from '../cases/tryFile';
import { addMembers, freezeVersion, newDataset, readDataset, versionHash, withMembers } from './datasetFile';
import { heldOut, splitOf } from './datasetSplit';
import { datasetStats, memberGroups, membersOf, queryMembers } from './datasetView';

const summary = (id: string, over: Partial<TrySummary> = {}): TrySummary => ({
  id,
  sceneId: 'scene-1',
  robot: 'SO-101',
  modelHash: 'model-a',
  caseId: 'grasp',
  caseName: 'Grasp the Block',
  source: 'case',
  input: null,
  startedAt: '2026-11-14T00:00:00Z',
  seconds: 6,
  frames: 300,
  outcome: { verdict: 'passed', margin: 0.2 },
  seed: 0,
  sourceTry: null,
  recording: true,
  strip: false,
  ...over,
});

const ids = (n: number, prefix = 't') => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);

const made = (members: string[], over: { query?: string } = {}) =>
  newDataset({ id: 'dataset-1', name: 'Grasp the Block', task: 'Grasp the block.', members, at: 'now', ...over });

describe('a dataset file', () => {
  it('reads back what it writes and refuses ids that could become paths', () => {
    const dataset = made(['a', 'b', 'a']);

    expect(dataset.members).toEqual(['a', 'b']);
    expect(readDataset(JSON.parse(JSON.stringify(dataset)))).toEqual(dataset);
    expect(readDataset({ ...dataset, id: '../auth' })).toBeNull();
    expect(readDataset({ ...dataset, members: ['ok', 'a/b'] })).toBeNull();
    expect(readDataset({ ...dataset, versions: [{ n: 0, hash: 'h', at: 'now', members: [] }] })).toBeNull();
    expect(readDataset({ ...dataset, version: 2 })).toBeNull();
  });

  it('keeps one version hash while its members are unchanged, and a new one when they change', async () => {
    const tries = ids(4).map((id) => summary(id));
    const dataset = made(ids(3));
    const first = await versionHash(dataset, tries);

    expect(await versionHash(made(ids(3)), tries)).toBe(first);
    expect(await versionHash(made([...ids(3)].reverse()), tries)).not.toBe(first);
    expect(await versionHash(made(ids(4)), tries)).not.toBe(first);
    expect(
      await versionHash(
        dataset,
        tries.map((t) => ({ ...t, outcome: { verdict: 'failed', margin: 0 } })),
      ),
    ).not.toBe(first);
  });

  it('freezes version 1 once, then version 2 with the failed runs added to it', async () => {
    const passed = ids(5).map((id) => summary(id));
    const failed = ids(2, 'run').map((id) => summary(id, { outcome: { verdict: 'failed', margin: -0.1 } }));
    const tries = [...passed, ...failed];
    const start = made(ids(5));
    const one = freezeVersion(start, await versionHash(start, tries), 'train');
    const again = freezeVersion(one.dataset, await versionHash(one.dataset, tries), 'export');

    expect(one.version.n).toBe(1);
    expect(again.dataset).toBe(one.dataset);
    expect(again.version).toBe(one.version);

    const grown = addMembers(one.dataset, ['run1', 'run2', 't1']);
    const two = freezeVersion(grown, await versionHash(grown, tries), 'publish');

    expect(two.version.n).toBe(2);
    expect(two.version.members).toEqual([...ids(5), 'run1', 'run2']);
    expect(two.dataset.versions.map((v) => v.members.length)).toEqual([5, 7]);
  });
});

describe('a dataset’s split', () => {
  it('is the same every time for the same tries and seed, and holds out tries as Forge does', () => {
    const tries = ids(10);
    const split = splitOf(tries, 42);

    expect(splitOf([...tries].reverse(), 42)).toEqual(split);
    expect(splitOf(tries, 43).order).not.toEqual(split.order);
    expect([...split.train, ...split.validation].sort()).toEqual([...tries].sort());
    expect(split.validation).toEqual(split.order.filter((_, i) => heldOut(i, 10)));
    expect(split.validation).toHaveLength(2);
    expect(splitOf(ids(3), 42).validation).toHaveLength(1);
    expect(splitOf(ids(1), 42).validation).toEqual([]);
  });
});

describe('a dataset’s members', () => {
  it('lists tries from another model apart', () => {
    const tries = [summary('a'), summary('b', { modelHash: 'model-b', robot: 'SO-100' }), summary('c')];
    const dataset = made(['a', 'b', 'c', 'gone']);
    const members = membersOf(dataset, tries);
    const groups = memberGroups(members, 'model-a');

    expect(members.map((t) => t.id)).toEqual(['a', 'b', 'c']);
    expect(groups.fitting.map((t) => t.id)).toEqual(['a', 'c']);
    expect(groups.apart.map((t) => t.id)).toEqual(['b']);
    expect(memberGroups(members, null).apart).toEqual([]);
  });

  it('reruns its query on Update, picking up tries recorded since', () => {
    const before = [summary('a'), summary('b', { caseName: 'Push the Box' })];
    const dataset = made(queryMembers('grasp', before), { query: 'grasp' });
    const after = [...before, summary('c'), summary('d', { source: 'real' })];

    expect(dataset.members).toEqual(['a']);
    expect(withMembers(dataset, queryMembers(dataset.query!, after)).members).toEqual(['a', 'c', 'd']);
    expect(queryMembers('real', after)).toEqual(['d']);
  });

  it('counts episodes and their total time', () => {
    const stats = datasetStats([
      summary('a'),
      summary('b', { source: 'generated', seconds: 4 }),
      summary('c', { robot: 'SO-100', outcome: { verdict: 'failed', margin: 0 } }),
    ]);

    expect(stats).toEqual({ episodes: 3, seconds: 16 });
  });
});
