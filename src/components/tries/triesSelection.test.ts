import { describe, expect, it } from 'vitest';
import { clickTry, focusedTry, NO_SELECTION, withoutTries } from './triesSelection';

const order = ['a', 'b', 'c', 'd', 'e'];

describe('clickTry', () => {
  it('selects one on a plain click', () => {
    const picked = clickTry({ ids: ['a', 'b'], anchor: 'a', focus: 'b' }, { id: 'c', mode: 'one', order });

    expect(picked).toEqual({ ids: ['c'], anchor: 'c', focus: 'c' });
  });

  it('selects the range from the anchor, either way, keeping the anchor', () => {
    const start = clickTry(NO_SELECTION, { id: 'b', mode: 'one', order });

    expect(clickTry(start, { id: 'd', mode: 'range', order })).toEqual({
      ids: ['b', 'c', 'd'],
      anchor: 'b',
      focus: 'd',
    });
    expect(clickTry(start, { id: 'a', mode: 'range', order }).ids).toEqual(['a', 'b']);
  });

  it('selects one on a range click without an anchor', () => {
    expect(clickTry(NO_SELECTION, { id: 'c', mode: 'range', order }).ids).toEqual(['c']);
  });

  it('toggles one in and out', () => {
    const start = clickTry(NO_SELECTION, { id: 'a', mode: 'one', order });
    const added = clickTry(start, { id: 'c', mode: 'toggle', order });

    expect(added).toEqual({ ids: ['a', 'c'], anchor: 'c', focus: 'c' });

    const removed = clickTry(added, { id: 'c', mode: 'toggle', order });

    expect(removed.ids).toEqual(['a']);
    expect(focusedTry(removed)).toBe('a');
  });
});

describe('focusedTry and withoutTries', () => {
  it('has no focus with nothing selected', () => {
    expect(focusedTry(NO_SELECTION)).toBeNull();
  });

  it('drops deleted tries from the selection', () => {
    const left = withoutTries({ ids: ['a', 'b'], anchor: 'a', focus: 'b' }, ['b']);

    expect(left).toEqual({ ids: ['a'], anchor: 'a', focus: null });
    expect(focusedTry(left)).toBeNull();
  });
});
