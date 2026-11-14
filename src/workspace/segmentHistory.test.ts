import { describe, expect, it } from 'vitest';
import { splitAt, type TrySegment } from '../cases/tryLabels';
import { adopted, stepped } from './useSegmentEdits';

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

  it('takes the agent’s write to the open try as an undoable step, and ignores other tries', () => {
    const split = splitAt(first, 40);
    const edits = { id: 'try', segments: split, past: [first], future: [] };
    const written: TrySegment[] = [{ ...first[0], instruction: 'pick up the red block' }];
    const taken = adopted(edits, 'try', written)!;

    expect(taken.segments).toEqual(written);
    expect(stepped(taken, true)!.segments).toEqual(split);
    expect(adopted(edits, 'other', written)).toBe(edits);
    expect(adopted(edits, 'try', split)).toBe(edits);
  });
});
