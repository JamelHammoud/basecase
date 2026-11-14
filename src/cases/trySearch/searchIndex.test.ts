import { describe, expect, it } from 'vitest';
import { parseQuery } from './queryParser';
import { graspMotion, storedTry, walkMotion, waveMotion, type TrySpec } from './fixtures/searchFixtures';
import { TrySearchIndex } from './searchIndex';
import type { TryHit } from './types';

const NOW = new Date(2026, 10, 14, 15, 0);

const SPECS: TrySpec[] = [
  { id: 'pick-1', verdict: 'failed', motion: graspMotion() },
  { id: 'pick-2', verdict: 'failed', sceneId: 'scene-b' },
  { id: 'pick-passed' },
  { id: 'pick-keys', input: 'keys', verdict: 'failed' },
  { id: 'pick-blue', caseName: 'Grasp the Blue Block', verdict: 'failed' },
  { id: 'pick-faulted', caseName: 'Grasping Red Blocks', verdict: 'failed', faulted: true },
  {
    id: 'walk-long',
    robot: 'Hexapod',
    caseName: 'Walk the Corridor',
    input: 'gamepad',
    seconds: 45,
    motion: walkMotion(),
  },
  { id: 'walk-short', robot: 'Hexapod', caseName: 'Walk the Corridor', input: 'gamepad', seconds: 20 },
  { id: 'walk-g1', robot: 'G1', caseName: 'Walk the Corridor', input: 'camera', seconds: 60, motion: walkMotion(29) },
  { id: 'old-1', caseName: 'Stack Cups', startedAt: '2026-11-03T10:00:00.000Z', input: null },
  { id: 'old-2', caseName: 'Stack Cups', startedAt: '2026-11-08T21:00:00.000Z', input: null },
  { id: 'older', caseName: 'Stack Cups', startedAt: '2026-10-20T10:00:00.000Z', input: null },
  { id: 'tidy', caseName: 'Tidy Desk', input: 'script', task: 'Put the yellow duck in the blue bin' },
  {
    id: 'imported',
    caseName: null,
    source: 'import',
    input: null,
    verdict: 'unjudged',
    task: 'Fold the towel',
    origin: { kind: 'hub', repo: 'lab/drawer-runs', revision: 'abc' },
  },
  { id: 'mat-keys', robot: 'Hexapod', caseName: 'Walk the Mat', input: 'keys' },
  { id: 'mat-input', robot: 'Hexapod', caseName: 'Walk the Ramp', input: 'mat' },
  { id: 'like-a1', sceneId: 'scene-a', caseName: 'Pick Cube', motion: graspMotion(1.2, 0.01) },
  { id: 'like-a2', sceneId: 'scene-a', caseName: 'Pick Cube', motion: graspMotion(0.8, 0.02) },
  { id: 'like-b1', sceneId: 'scene-b', caseName: 'Pick Bolt', motion: graspMotion(1.5, 0.015) },
  { id: 'wave-1', sceneId: 'scene-b', caseName: 'Wave Hello', motion: waveMotion() },
  { id: 'walk-b', sceneId: 'scene-b', robot: 'Hexapod', caseName: 'Walk Ramp', motion: walkMotion() },
];

const build = (specs = SPECS) => {
  const index = new TrySearchIndex();

  index.put(specs.map(storedTry));

  return index;
};

const find = (index: TrySearchIndex, text: string, limit = 50) =>
  index.search(parseQuery(text, index.vocab(), NOW), limit);

const ids = (hits: TryHit[]) => hits.map((h) => h.tryId);

const sorted = (hits: TryHit[]) => ids(hits).sort();

describe('searching tries by words and facts', () => {
  it('finds exactly the failed red-block grasps from the leader arm', () => {
    const hits = find(build(), 'failed grasp red block leader-arm');

    expect(sorted(hits)).toEqual(['pick-1', 'pick-2', 'pick-faulted']);
    expect(hits.every((h) => h.match === 'words')).toBe(true);
    expect(hits.find((h) => h.tryId === 'pick-1')).toMatchObject({
      label: 'Grasp the Red Block',
      robot: 'SO-101 Arm',
      verdict: 'failed',
    });
  });

  it('finds the hexapod’s walks over 30 s', () => {
    expect(ids(find(build(), 'walk hexapod over 30 s'))).toEqual(['walk-long']);
  });

  it('keeps a try exactly at the limit for at least, and leaves it out for over', () => {
    expect(sorted(find(build(), 'walk hexapod at least 20 s'))).toEqual(['walk-long', 'walk-short']);
    expect(ids(find(build(), 'walk hexapod over 20 s'))).toEqual(['walk-long']);
  });

  it('lists the tries from last week, newest first', () => {
    const hits = find(build(), 'last week');

    expect(ids(hits)).toEqual(['old-2', 'old-1']);
    expect(hits.every((h) => h.match === 'facts')).toBe(true);
  });

  it('finds words from the Case’s task', () => {
    expect(ids(find(build(), 'yellow bin'))).toEqual(['tidy']);
  });

  it('finds an imported try by its origin and titles it by its task', () => {
    const hits = find(build(), 'drawer runs');

    expect(ids(hits)).toEqual(['imported']);
    expect(hits[0].label).toBe('Fold the towel');
  });

  it('narrows by a robot name, an input and a fault', () => {
    expect(sorted(find(build(), 'walk corridor'))).toEqual(['walk-g1', 'walk-long', 'walk-short']);
    expect(sorted(find(build(), 'walk corridor g1'))).toEqual(['walk-g1']);
    expect(ids(find(build(), 'failed red keys'))).toEqual(['pick-keys']);
    expect(ids(find(build(), 'faulted'))).toEqual(['pick-faulted']);
  });

  it('reads an input that names a Case both as a fact and as words', () => {
    expect(sorted(find(build(), 'walk the mat'))).toEqual(['mat-input', 'mat-keys']);
    expect(ids(find(build(), 'walk the gamepad'))).not.toContain('mat-keys');
  });

  it('returns nothing for an empty search, and respects the limit', () => {
    expect(find(build(), '  ')).toEqual([]);
    expect(find(build(), 'arm', 2)).toHaveLength(2);
  });
});

describe('More Like This', () => {
  it('finds the three similar grasps across two scenes and no walks', () => {
    const hits = find(build(), 'like:pick-1');

    expect(sorted(hits.slice(0, 3))).toEqual(['like-a1', 'like-a2', 'like-b1']);
    expect(new Set(hits.slice(0, 3).map((h) => h.sceneId))).toEqual(new Set(['scene-a', 'scene-b']));
    expect(ids(hits)).not.toContain('pick-1');
    expect(hits.some((h) => h.robot === 'Hexapod' || h.label.startsWith('Walk'))).toBe(false);
    expect(ids(hits)).toContain('wave-1');
    expect(hits.every((h) => h.match === 'motion')).toBe(true);
  });

  it('keeps facts and words, and finds nothing for a try without motion', () => {
    const index = build();

    expect(ids(find(index, 'like:pick-1 scene cube'))).toEqual([]);
    expect(sorted(find(index, 'like:pick-1 pick cube'))).toEqual(['like-a1', 'like-a2']);
    expect(find(index, 'like:pick-2')).toEqual([]);
    expect(find(index, 'like:missing')).toEqual([]);
  });
});

describe('keeping the index', () => {
  const queries = ['failed grasp red block leader-arm', 'yellow', 'last week', 'walk', 'like:pick-1', 'stack'];

  it('rebuilt from manifests or a snapshot, gives the same results as the updated one', () => {
    const updated = build();
    const changed = { ...SPECS.find((s) => s.id === 'old-1')!, task: 'Stack the yellow cups' };

    updated.put([storedTry(changed)], { 'old-1': 7 });
    updated.remove(['pick-2']);

    const finalSpecs = SPECS.filter((s) => s.id !== 'pick-2').map((s) => (s.id === 'old-1' ? changed : s));
    const rebuilt = build(finalSpecs);
    const restored = TrySearchIndex.fromSnapshot(updated.snapshot())!;

    for (const q of queries) {
      expect(sorted(find(rebuilt, q)), q).toEqual(sorted(find(updated, q)));
      expect(find(restored, q), q).toEqual(find(updated, q));
    }

    expect(restored.stamps()['old-1']).toBe(7);
    expect(restored.vocab()).toEqual(updated.vocab());
    expect(TrySearchIndex.fromSnapshot(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(
      TrySearchIndex.fromSnapshot(new TextEncoder().encode('{"format":"other","version":1,"tries":[]}')),
    ).toBeNull();
  });

  it('drops a deleted try', () => {
    const index = build();

    index.remove(['pick-1']);

    expect(index.ids()).not.toContain('pick-1');
    expect(ids(find(index, 'red block'))).not.toContain('pick-1');
    expect(find(index, 'like:pick-1')).toEqual([]);
  });
});

describe('word forms', () => {
  it.each([
    ['grasps', 'Grasping'],
    ['grasped', 'Grasp'],
    ['placed', 'Placing'],
    ['dropping', 'Drop'],
    ['boxes', 'Box'],
    ['batteries', 'Battery'],
  ])('matches %s with %s', (query, caseName) => {
    expect(ids(find(build([{ id: 'one', caseName }]), query))).toEqual(['one']);
  });

  it('keeps short words whole', () => {
    expect(ids(find(build(), 'red bed'))).toHaveLength(0);
  });
});
