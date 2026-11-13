import { describe, expect, it } from 'vitest';
import { membersOf } from '../lib/evidence.mjs';
import { nextMembers } from './batch.mjs';

const pull = (number) => ({ number });

describe('membersOf', () => {
  it('reads the pull requests a batch lists', () => {
    expect(membersOf('Merges 3 reviewed pull requests.\n\n- #12 Refine: a\n- #40 Fix: b\n- #7 Feature: c\n')).toEqual([
      12, 40, 7,
    ]);
  });
});

describe('nextMembers', () => {
  it('takes up to fifteen ready pull requests, oldest first', () => {
    const ready = Array.from({ length: 20 }, (_, i) => pull(i + 1));

    expect(nextMembers(ready, [])).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
  });

  it('retries half of a failed batch that is still ready', () => {
    expect(nextMembers([pull(1), pull(2), pull(3), pull(4), pull(9)], [1, 2, 3, 4])).toEqual([1, 2]);
  });

  it('narrows a failed pair to one, and skips members that are no longer ready', () => {
    expect(nextMembers([pull(5), pull(9)], [5, 6])).toEqual([5]);
  });
});
