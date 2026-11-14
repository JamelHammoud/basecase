import { describe, expect, it } from 'vitest';
import { splitAt, type TrySegment } from '../cases/tryLabels';
import { stepped } from './useSegmentEdits';

const first: TrySegment[] = [{ start: 0, end: 100, label: 'grasp the block' }];

describe('segment edit history', () => {
  it('undoes and redoes a split, and stops at either end', () => {
    const split = splitAt(first, 40);
    const edits = { id: 'try', segments: split, past: [first], future: [] };
    const undone = stepped(edits, true)!;

    expect(undone.segments).toEqual(first);
    expect(stepped(undone, true)).toBeNull();

    const redone = stepped(undone, false)!;

    expect(redone.segments).toEqual(split);
    expect(redone.past).toEqual([first]);
    expect(stepped(redone, false)).toBeNull();
  });
});
