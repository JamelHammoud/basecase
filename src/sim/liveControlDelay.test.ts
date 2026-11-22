import { describe, expect, it } from 'vitest';
import { ControlDelay } from './controlDelay';
import { LiveControlDelay } from './liveControlDelay';

describe('live delay against the frozen Arena reference', () => {
  it.each([0, 1, 2, 20, 40])('preserves %i step latency through startup, wraps and reset', (steps) => {
    const arena = new ControlDelay();
    const live = new LiveControlDelay();

    for (const width of [8, 3, 0]) {
      arena.reset(steps);
      live.reset(steps);

      for (let tick = 0; tick < 600; tick++) {
        const expected = Float64Array.from({ length: width }, (_, channel) => Math.sin(tick + channel));
        const actual = expected.slice();

        arena.apply(expected);
        live.apply(actual);
        expect(actual).toEqual(expected);
      }
    }
  });
});
