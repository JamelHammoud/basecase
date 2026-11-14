import { describe, expect, it } from 'vitest';
import { capacityHold } from './capacity.mjs';

describe('fitting the loop to the Mac', () => {
  it('holds lanes that open new work first, and keeps room for the lanes that drain the queue', () => {
    expect(capacityHold({ lane: 'build', sessions: 8, loadPerCore: 1 })).toBe('8 agent sessions are running');
    expect(capacityHold({ lane: 'review', sessions: 8, loadPerCore: 1 })).toBeNull();
    expect(capacityHold({ lane: 'revise', sessions: 14, loadPerCore: 1 })).toBe('14 agent sessions are running');
  });

  it('holds lanes that open new work on load per core too, but never the lanes that drain the queue', () => {
    expect(capacityHold({ lane: 'harness', sessions: 2, loadPerCore: 4.6 })).toBe('the Mac is at 4.6× its cores');
    expect(capacityHold({ lane: 'rebase', sessions: 2, loadPerCore: 6 })).toBeNull();
  });
});
