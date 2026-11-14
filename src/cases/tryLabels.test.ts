import { describe, expect, it } from 'vitest';
import { readStoredTry, TRY_FILE_VERSION, type StoredTry } from './tryFile';
import {
  canMark,
  marked,
  mergeIntoPrevious,
  moveBoundary,
  readLabels,
  renameSegment,
  retagged,
  sharedTags,
  splitAt,
  tagsFrom,
  withLabels,
  type TrySegment,
} from './tryLabels';
import { segmentHistory } from './segmentHistory';

const SEGMENTS: TrySegment[] = [
  { from: 0, to: 50, label: 'reach block' },
  { from: 50, to: 80, label: 'grasp block', instruction: 'grasp the red block' },
  { from: 80, to: 150, label: 'lift block' },
];

const stored = (over: Partial<StoredTry> = {}): StoredTry => ({
  version: TRY_FILE_VERSION,
  id: 'try-1',
  sceneId: 'scene-1',
  robot: { name: 'Arm', modelHash: 'm', joints: [] },
  case: null,
  source: 'import',
  input: null,
  startedAt: '2026-11-14T10:00:00.000Z',
  seconds: 3,
  rate: 50,
  frames: 150,
  outcome: { verdict: 'unjudged', margin: null },
  seed: 0,
  sourceTry: null,
  faults: [],
  ...over,
});

describe('segment edits', () => {
  it('splits at the playhead and merges back into the one before', () => {
    const split = splitAt(SEGMENTS, 60)!;

    expect(split.map((s) => [s.from, s.to, s.label])).toEqual([
      [0, 50, 'reach block'],
      [50, 60, 'grasp block'],
      [60, 80, 'grasp block'],
      [80, 150, 'lift block'],
    ]);
    expect(splitAt(SEGMENTS, 50)).toBeNull();
    expect(mergeIntoPrevious(split, 2)).toEqual([
      { from: 0, to: 50, label: 'reach block' },
      { from: 50, to: 80, label: 'grasp block' },
      { from: 80, to: 150, label: 'lift block' },
    ]);
    expect(mergeIntoPrevious(SEGMENTS, 0)).toBeNull();
  });

  it('moves a boundary without emptying a segment, and renames in place', () => {
    expect(moveBoundary(SEGMENTS, 1, 10)?.[1].from).toBe(10);
    expect(moveBoundary(SEGMENTS, 1, 200)?.[1].from).toBe(79);
    expect(moveBoundary(SEGMENTS, 1, -5)?.[0].to).toBe(1);
    expect(renameSegment(SEGMENTS, 2, '  lift the block ')?.[2].label).toBe('lift the block');
    expect(renameSegment(SEGMENTS, 2, '  ')).toBeNull();
  });

  it('undoes and redoes a split and a merge in order', () => {
    let history = segmentHistory(SEGMENTS);

    history = history.apply(splitAt(history.now, 60)!);
    history = history.apply(mergeIntoPrevious(history.now, 1)!);
    expect(history.now.map((s) => s.to)).toEqual([60, 80, 150]);

    history = history.undo()!;
    expect(history.now.map((s) => s.to)).toEqual([50, 60, 80, 150]);
    history = history.undo()!;
    expect(history.now).toEqual(SEGMENTS);
    expect(history.undo()).toBeNull();
    history = history.redo()!;
    expect(history.now.map((s) => s.to)).toEqual([50, 60, 80, 150]);
  });
});

describe('tags', () => {
  it('reads a typed list and tags 50 tries in one action', () => {
    expect(tagsFrom(' red block,  leader arm , red block,,')).toEqual(['red block', 'leader arm']);

    const tries = Array.from({ length: 50 }, (_, i) => withLabels(stored({ id: `t${i}` }), { tags: ['old'] }));
    const tagged = tries.map((t) => withLabels(t, { tags: retagged(t.labels!.tags, { add: ['grasp'], remove: [] }) }));

    expect(tagged.every((t) => t.labels!.tags.join() === 'old,grasp')).toBe(true);
    expect(sharedTags(tagged.map((t) => t.labels!.tags))).toEqual(['old', 'grasp']);
    expect(retagged(['old', 'grasp'], { add: [], remove: ['old'] })).toEqual(['grasp']);
  });
});

describe('outcomes', () => {
  it('marks an unjudged try by hand and refuses a judged one', () => {
    const failed = marked(stored(), 'failed')!;

    expect(failed.outcome).toEqual({ verdict: 'failed', margin: null, by: 'person' });
    expect(marked(failed, 'passed')?.outcome.verdict).toBe('passed');
    expect(marked(stored({ outcome: { verdict: 'passed', margin: 0.2 } }), 'failed')).toBeNull();
    expect(canMark({ outcome: { verdict: 'failed', margin: 0.1, by: 'contract' } })).toBe(false);
  });
});

describe('the stored labels', () => {
  it('round-trip through the manifest reader and refuse a gap', () => {
    const labelled = withLabels(stored({ outcome: { verdict: 'failed', margin: null, by: 'person' } }), {
      segments: SEGMENTS,
      tags: ['red block'],
      flags: [{ kind: 'joint-limit', at: 1.2, joint: 'j1' }],
      instruction: 'pick up the red block',
    });

    expect(readStoredTry(JSON.parse(JSON.stringify(labelled)))).toEqual(labelled);
    expect(readLabels({ ...labelled.labels, segments: [SEGMENTS[0], SEGMENTS[2]] })).toBeNull();
    expect(readStoredTry({ ...labelled, outcome: { verdict: 'passed', margin: null, by: 'someone' } })).toBeNull();
  });
});
