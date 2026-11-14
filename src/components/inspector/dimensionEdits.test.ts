import { describe, expect, it } from 'vitest';
import { BRACKET_CODE } from '../../agent/fixtures/tunedBracket';
import { noEdits, seenAt, settled, shownValue, withEdit } from './dimensionEdits';

const before = BRACKET_CODE;
const tuned = BRACKET_CODE.replace('wall = 2;', 'wall = 3;');

const send = (code: string, value: number, was = 2) => {
  const next = withEdit(noEdits(code), { code, name: 'wall', value, was });

  if (!next) throw new Error('expected an edit to send');

  return next;
};

describe('dimension edits', () => {
  it('shows a sent value until the tuned part lands, then the code', () => {
    const sent = send(before, 3);

    expect(shownValue(seenAt(sent, before), 'wall', 2)).toBe(3);
    expect(shownValue(seenAt(sent, tuned), 'wall', 3)).toBe(3);
    expect(seenAt(sent, tuned).values).toEqual({});
  });

  it('shows the restored value after undo, even while a tune is still in flight', () => {
    const first = send(before, 3);
    const second = withEdit(first, { code: before, name: 'wall', value: 4, was: 3 })!;
    const landed = seenAt(second, tuned);
    const undone = seenAt(landed, before);

    expect(shownValue(undone, 'wall', 2)).toBe(2);
    expect(shownValue(settled(undone, first), 'wall', 2)).toBe(2);
  });

  it('shows the restored value after undo once the tune settles', () => {
    const sent = send(before, 3);
    const done = settled(seenAt(sent, tuned), sent);

    expect(shownValue(seenAt(done, before), 'wall', 2)).toBe(2);
  });

  it('keeps a later edit when an earlier one settles', () => {
    const first = send(before, 3);
    const second = withEdit(first, { code: before, name: 'wall', value: 4, was: 3 })!;

    expect(shownValue(settled(second, first), 'wall', 2)).toBe(4);
    expect(shownValue(settled(second, second), 'wall', 2)).toBe(2);
  });

  it('sends nothing when the value is what the field already shows', () => {
    expect(withEdit(noEdits(before), { code: before, name: 'wall', value: 2, was: 2 })).toBeNull();
    expect(withEdit(send(before, 3), { code: before, name: 'wall', value: 3, was: 2 })).toBeNull();
  });
});
