import { describe, expect, it } from 'vitest';
import { loopOf, playedFrame } from './useTimelinePlayback';

describe('timeline playback', () => {
  it('plays to the last frame and stops there', () => {
    expect(playedFrame(10, 5, { last: 99, loop: null })).toBe(15);
    expect(playedFrame(95, 50, { last: 99, loop: null })).toBe(99);
  });

  it('loops a dragged range, starting inside it from wherever the playhead was', () => {
    const loop = loopOf(60, 40);

    expect(loop).toEqual([40, 60]);
    expect(playedFrame(50, 5, { last: 99, loop })).toBe(55);
    expect(playedFrame(50, 11, { last: 99, loop })).toBe(40);
    expect(playedFrame(50, 32, { last: 99, loop })).toBe(40 + ((10 + 32) % 21));
    expect(playedFrame(5, 3, { last: 99, loop })).toBe(43);
  });

  it('takes a press without a drag as no range', () => {
    expect(loopOf(12, 12.2)).toBeNull();
  });
});
