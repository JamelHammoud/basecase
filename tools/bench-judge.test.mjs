import { describe, expect, it } from 'vitest';
import { extractJson } from '../bench/judge.mjs';

describe('extractJson', () => {
  it('finds the last object with the key', () => {
    expect(extractJson('Notes {"a":1} then {"scores":{"overall":7}}', 'scores')).toEqual({ scores: { overall: 7 } });
  });

  it('gives up instead of looping when the reply starts with an unmatched brace', () => {
    expect(extractJson('{ not json at all', 'scores')).toBeNull();
  });
});
