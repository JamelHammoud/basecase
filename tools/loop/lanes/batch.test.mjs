import { describe, expect, it } from 'vitest';
import { membersOf } from '../lib/evidence.mjs';

describe('membersOf', () => {
  it('reads the pull requests a batch lists', () => {
    expect(membersOf('Merges 3 reviewed pull requests.\n\n- #12 Refine: a\n- #40 Fix: b\n- #7 Feature: c\n')).toEqual([
      12, 40, 7,
    ]);
  });
});
