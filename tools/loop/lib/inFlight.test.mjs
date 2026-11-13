import { describe, expect, it } from 'vitest';
import { duplicateTarget, inFlightText } from './inFlight.mjs';

const open = [
  { number: 160, title: 'Refine: Call removing a robot Delete', createdAt: '2026-11-13T07:21:00Z' },
  { number: 282, title: 'Refine: Call taking a robot off Robots Delete', createdAt: '2026-11-13T09:12:00Z' },
];
const merged = [{ number: 222, title: 'Refine: Drop the Insert button', createdAt: '2026-11-13T07:00:00Z' }];

describe('work already in flight', () => {
  it('lists open and merged pull requests, leaving out the one under review', () => {
    expect(inFlightText({ open, merged, except: 282 })).toBe(
      '- #160 (open) Refine: Call removing a robot Delete\n- #222 (merged) Refine: Drop the Insert button',
    );
  });

  it('closes a duplicate of an older open pull request or a merged one', () => {
    expect(duplicateTarget({ duplicateOf: 160, pull: open[1], open, merged })).toBe(160);
    expect(duplicateTarget({ duplicateOf: 222, pull: open[1], open, merged })).toBe(222);
  });

  it('keeps the older one when the newer is named, and ignores numbers it was not shown', () => {
    expect(duplicateTarget({ duplicateOf: 282, pull: open[0], open, merged })).toBeNull();
    expect(duplicateTarget({ duplicateOf: 999, pull: open[1], open, merged })).toBeNull();
    expect(duplicateTarget({ duplicateOf: 0, pull: open[1], open, merged })).toBeNull();
  });
});
