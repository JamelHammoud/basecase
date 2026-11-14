import { describe, expect, it } from 'vitest';
import { nextFeedDraw } from './feedPace';

const idle = { dirty: false, tiles: 0, vision: 0, drewAt: 1000, streamsAt: Infinity };

describe('camera vision pacing', () => {
  it('refreshes still subscribed cameras so perception stays fresh after motion stops', () => {
    expect(nextFeedDraw({ ...idle, vision: 1 })).toBe(1200);
    expect(nextFeedDraw({ ...idle, vision: 1, dirty: true })).toBe(1200);
    expect(nextFeedDraw(idle)).toBe(Infinity);
  });

  it('keeps changed visible tiles and code streams on their own faster clocks', () => {
    expect(nextFeedDraw({ ...idle, vision: 1, tiles: 1, dirty: true })).toBeCloseTo(1016.6667, 3);
    expect(nextFeedDraw({ ...idle, vision: 1, streamsAt: 1100 })).toBe(1100);
    expect(nextFeedDraw({ ...idle, vision: 1, tiles: 1 })).toBe(1200);
  });
});
