import { describe, expect, it } from 'vitest';
import { MAX_SNAPSHOTS, NO_SNAPSHOTS, newestSnapshot, snapshotRefs, trailRefs, withSnapshot } from './snapshots';

const ref = (iteration: number) => ({ run: 'policy-a', iteration, steps: iteration * 100 });

const written = (count: number) =>
  Array.from({ length: count }, (_, i) => ref(i + 1)).reduce((trail, next) => withSnapshot(trail, next), NO_SNAPSHOTS);

describe('the snapshot trail', () => {
  it('keeps every snapshot up to twelve', () => {
    expect(trailRefs(written(12)).map((r) => r.iteration)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('thins forty snapshots to the same twelve Forge keeps, first and newest included', () => {
    const kept = trailRefs(written(40)).map((r) => r.iteration);
    const gaps = kept.slice(1).map((n, i) => n - kept[i]);

    expect(kept).toHaveLength(MAX_SNAPSHOTS);
    expect(kept[0]).toBe(1);
    expect(kept.at(-1)).toBe(40);
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(3);
    expect(kept).toEqual([1, 5, 9, 13, 17, 21, 24, 27, 30, 33, 36, 40]);
  });

  it('drops the earliest interior snapshot first when the gaps are even', () => {
    expect(trailRefs(written(13)).map((r) => r.iteration)).toEqual([1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  });

  it('names the newest snapshot', () => {
    expect(newestSnapshot(NO_SNAPSHOTS)).toBeNull();
    expect(newestSnapshot(written(30))).toEqual(ref(30));
  });

  it('reads only well-formed refs from a saved record', () => {
    expect(snapshotRefs([ref(1), { run: 3 }, { run: 'policy-b', iteration: 1.5, steps: 1 }, null])).toEqual([ref(1)]);
    expect(snapshotRefs('nope')).toEqual([]);
  });
});
