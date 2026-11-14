import { describe, expect, it } from 'vitest';
import { parseQuery } from './queryParser';
import { graspMotion, pickSegments, storedTry, walkMotion, waveMotion, type TrySpec } from './fixtures/searchFixtures';
import { FRAME_MIN, TrySearchIndex } from './searchIndex';
import type { TryHit } from './types';

const NOW = new Date(2026, 10, 14, 15, 0);

const SPECS: TrySpec[] = [
  { id: 'pick-1', verdict: 'failed', segments: pickSegments('grasp red block', 'failed'), motion: graspMotion() },
  { id: 'pick-2', segments: pickSegments('grasp the red block', 'failed') },
  { id: 'pick-3', verdict: 'failed', segments: pickSegments('grasp red block', 'passed') },
  { id: 'pick-keys', input: 'keys', verdict: 'failed', segments: pickSegments('grasp red block') },
  { id: 'pick-blue', caseName: 'Pick the Blue Block', verdict: 'failed', segments: pickSegments('grasp blue block') },
  { id: 'pick-4', verdict: 'failed', segments: pickSegments('grasping red blocks') },
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
  { id: 'old-2', caseName: 'Stack Cups', startedAt: '2026-11-08T21:00:00.000Z', input: null, tags: ['wobbly'] },
  { id: 'older', caseName: 'Stack Cups', startedAt: '2026-10-20T10:00:00.000Z', input: null },
  {
    id: 'agent-1',
    caseName: 'Tidy Desk',
    input: 'script',
    instruction: 'Put the yellow duck in the blue bin',
    segments: [{ id: 'drop', label: 'drop duck', start: 1, end: 2, tags: ['wobbly'] }],
  },
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

const find = (index: TrySearchIndex, text: string, limit = 50, textVector: Float32Array | null = null) =>
  index.search(parseQuery(text, index.vocab(), NOW), { limit, textVector });

const keys = (hits: TryHit[]) => hits.map((h) => (h.segmentId ? `${h.tryId}/${h.segmentId}` : h.tryId));

const sorted = (hits: TryHit[]) => keys(hits).sort();

describe('searching tries by words and facts', () => {
  it('finds exactly the failed red-block grasps from the leader arm', () => {
    const hits = find(build(), 'failed grasp red block leader-arm');

    expect(sorted(hits)).toEqual(['pick-1/grasp', 'pick-2/grasp', 'pick-4/grasp']);
    expect(hits.every((h) => h.match === 'words')).toBe(true);
    expect(hits.find((h) => h.tryId === 'pick-1')).toMatchObject({ at: 3, end: 6, label: 'grasp red block' });
  });

  it('finds the hexapod’s walks over 30 s', () => {
    expect(keys(find(build(), 'walk hexapod over 30 s'))).toEqual(['walk-long']);
  });

  it('keeps a try exactly at the limit for at least, and leaves it out for over', () => {
    expect(sorted(find(build(), 'walk hexapod at least 20 s'))).toEqual(['walk-long', 'walk-short']);
    expect(keys(find(build(), 'walk hexapod over 20 s'))).toEqual(['walk-long']);
  });

  it('lists the tries from last week, newest first', () => {
    const hits = find(build(), 'last week');

    expect(keys(hits)).toEqual(['old-2', 'old-1']);
    expect(hits.every((h) => h.match === 'facts')).toBe(true);
  });

  it('finds a tag on a try and on a segment', () => {
    expect(sorted(find(build(), 'wobbly'))).toEqual(['agent-1/drop', 'old-2']);
  });

  it('finds words from an agent instruction', () => {
    expect(keys(find(build(), 'yellow bin'))).toEqual(['agent-1']);
  });

  it('narrows by a robot name', () => {
    expect(sorted(find(build(), 'walk corridor'))).toEqual(['walk-g1', 'walk-long', 'walk-short']);
    expect(sorted(find(build(), 'walk corridor g1'))).toEqual(['walk-g1']);
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
    expect(keys(hits)).not.toContain('pick-1');
    expect(hits.some((h) => h.robot === 'Hexapod' || h.label.startsWith('Walk'))).toBe(false);
    expect(keys(hits)).toContain('wave-1');
    expect(hits.every((h) => h.match === 'motion')).toBe(true);
  });

  it('compares a segment by its own time range, and keeps facts and words', () => {
    const index = build();

    expect(find(index, 'like:pick-1/grasp').length).toBeGreaterThan(0);
    expect(keys(find(index, 'like:pick-1 scene cube'))).toEqual([]);
    expect(sorted(find(index, 'like:pick-1 pick cube'))).toEqual(['like-a1', 'like-a2']);
    expect(find(index, 'like:missing')).toEqual([]);
  });
});

describe('what the cameras saw', () => {
  const unit = (i: number) => Float32Array.from({ length: 8 }, (_, k) => (k === i ? 1 : 0));

  it('ranks frames by match, opens at the second and boosts a words hit of the same try', () => {
    const index = build();

    index.putFrames('older', [
      { at: 0, vector: unit(1) },
      { at: 4, vector: unit(0) },
    ]);
    index.putFrames('old-1', [
      { at: 2, vector: Float32Array.from([0.99, Math.sqrt(1 - 0.99 ** 2), 0, 0, 0, 0, 0, 0]) },
    ]);
    index.putFrames('old-2', [{ at: 1, vector: Float32Array.from([0.9, Math.sqrt(1 - 0.81), 0, 0, 0, 0, 0, 0]) }]);

    expect(index.hasFrames('older')).toBe(true);

    const mug = find(index, 'red mug', 50, unit(0));

    expect(mug.map((h) => [h.tryId, h.at, h.match])).toEqual([
      ['older', 4, 'frame'],
      ['old-1', 2, 'frame'],
    ]);
    expect(mug[0].score).toBeGreaterThanOrEqual(FRAME_MIN);

    const stack = find(index, 'stack cups', 50, unit(0));

    expect(
      stack
        .slice(0, 2)
        .map((h) => h.tryId)
        .sort(),
    ).toEqual(['old-1', 'older']);
    expect(stack.every((h) => h.match === 'words')).toBe(true);
  });
});

describe('keeping the index', () => {
  const queries = ['failed grasp red block leader-arm', 'wobbly', 'last week', 'walk', 'like:pick-1', 'stack'];

  it('rebuilt from manifests or a snapshot, gives the same results as the updated one', () => {
    const updated = build();
    const changed = { ...SPECS.find((s) => s.id === 'old-1')!, tags: ['wobbly'] };

    updated.put([storedTry(changed)], { 'old-1': 7 });
    updated.remove(['pick-2']);
    updated.putFrames('older', [{ at: 1, vector: Float32Array.from([1, 0, 0]) }]);

    const finalSpecs = SPECS.filter((s) => s.id !== 'pick-2').map((s) => (s.id === 'old-1' ? changed : s));
    const rebuilt = build(finalSpecs);
    const restored = TrySearchIndex.fromSnapshot(updated.snapshot())!;

    for (const q of queries) {
      expect(sorted(find(rebuilt, q)), q).toEqual(sorted(find(updated, q)));
      expect(sorted(find(restored, q)), q).toEqual(sorted(find(updated, q)));
    }

    expect(restored.stamps()['old-1']).toBe(7);
    expect(restored.hasFrames('older')).toBe(true);
    expect(restored.vocab()).toEqual(updated.vocab());
    expect(TrySearchIndex.fromSnapshot(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it('drops a deleted try and its segments and frames', () => {
    const index = build();

    index.putFrames('pick-1', [{ at: 0, vector: Float32Array.from([1, 0]) }]);
    index.remove(['pick-1']);

    expect(index.ids()).not.toContain('pick-1');
    expect(index.hasFrames('pick-1')).toBe(false);
    expect(keys(find(index, 'red block')).some((k) => k.startsWith('pick-1'))).toBe(false);
    expect(find(index, 'like:pick-1')).toEqual([]);
  });
});

describe('word forms', () => {
  it.each([
    ['grasps', 'grasping'],
    ['grasped', 'grasp'],
    ['placed', 'placing'],
    ['dropping', 'drop'],
    ['boxes', 'box'],
    ['batteries', 'battery'],
  ])('matches %s with %s', (query, label) => {
    const index = build([{ id: 'one', segments: [{ id: 's', label, start: 0, end: 1 }] }]);

    expect(keys(find(index, query))).toEqual(['one/s']);
  });

  it('keeps short words whole', () => {
    expect(keys(find(build(), 'red bed'))).toHaveLength(0);
  });
});
