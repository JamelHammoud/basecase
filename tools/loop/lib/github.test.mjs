import { describe, expect, it } from 'vitest';
import { sameTitle } from './github.mjs';

describe('sameTitle', () => {
  it.each([
    [
      'Update: Move the agent adapters to their latest releases',
      'Update: Move the agent adapters to their latest releases',
    ],
    ['Refine: Trim the inspector', 'refine:  trim the inspector.'],
  ])('treats %s and %s as one', (a, b) => {
    expect(sameTitle(a, b)).toBe(true);
  });

  it('tells different work apart', () => {
    expect(sameTitle('Feature: Import from Onshape', 'Feature: Import from Fusion')).toBe(false);
  });
});
