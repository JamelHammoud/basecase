import { describe, expect, it } from 'vitest';
import { ready } from './landing.mjs';

const green = { review: 'success', check: 'success' };

describe('landing a pull request', () => {
  it('lands once review and its Check pass', () => {
    expect(ready(green)).toBe(true);
  });

  it('waits on review, its Check, conflicts and a revision', () => {
    expect(ready({ ...green, review: null })).toBe(false);
    expect(ready({ ...green, check: null })).toBe(false);
    expect(ready({ ...green, check: 'failure' })).toBe(false);
    expect(ready({ ...green, conflicting: true })).toBe(false);
    expect(ready({ ...green, revising: true })).toBe(false);
  });
});
