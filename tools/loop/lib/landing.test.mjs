import { describe, expect, it } from 'vitest';
import { landStep } from './landing.mjs';

const ready = { review: 'success', quick: 'success', full: null, dispatched: false };

describe('landing a reviewed pull request', () => {
  it('starts the full Check once review and the quick Check pass, and merges when it passes', () => {
    expect(landStep(ready)).toBe('start full');
    expect(landStep({ ...ready, full: 'pending' })).toBe('wait');
    expect(landStep({ ...ready, dispatched: true })).toBe('wait');
    expect(landStep({ ...ready, full: 'success' })).toBe('merge');
  });

  it('leaves a full Check failure to the revise lane, and never starts one twice for a head', () => {
    expect(landStep({ ...ready, full: 'failure' })).toBe('wait');
  });

  it('waits on review, conflicts, a revision or a red quick Check', () => {
    expect(landStep({ ...ready, review: null })).toBe('wait');
    expect(landStep({ ...ready, conflicting: true })).toBe('wait');
    expect(landStep({ ...ready, revising: true })).toBe('wait');
    expect(landStep({ ...ready, quick: 'failure' })).toBe('wait');
  });

  it('merges a repair on its own Check, which is already the full one', () => {
    expect(landStep({ ...ready, repair: true })).toBe('merge');
    expect(landStep({ ...ready, repair: true, quick: 'pending' })).toBe('wait');
  });
});
