import { describe, expect, it } from 'vitest';
import { ControlDelay } from './controlDelay';
import { LiveControlDelay } from './liveControlDelay';
import type { ActionOwner, TeachingControl } from './teaching';

const session = (owner: ActionOwner) => ({ owner }) as TeachingControl;

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

describe('live delay ownership', () => {
  it.each([1, 3])('reports the owner that issued each delayed command at %i steps', (steps) => {
    const delay = new LiveControlDelay();
    const first = session('policy');
    const owners: ActionOwner[] = [
      'policy',
      'operator',
      'operator',
      'policy',
      'operator',
      'policy',
      'policy',
      'operator',
    ];
    const applied = owners.map((owner) => {
      first.owner = owner;

      return delay.apply(new Float64Array(2), first);
    });

    delay.reset(steps);

    const reported = owners.map((owner) => {
      first.owner = owner;

      return delay.apply(new Float64Array(2), first);
    });

    expect(applied).toEqual(owners);
    expect(reported).toEqual(owners.map((_, tick) => (tick < steps ? owners[0] : owners[tick - steps])));
  });

  it('drops ownership from another session and survives a restored checkpoint', () => {
    const delay = new LiveControlDelay();
    const other = session('operator');
    const mine = session('policy');

    delay.reset(1);
    delay.apply(new Float64Array(1), other);

    expect(delay.apply(new Float64Array(1), mine)).toBeUndefined();

    const restored = new LiveControlDelay();

    restored.restore(delay.snapshot());

    expect(restored.apply(new Float64Array(1), mine)).toBeUndefined();
    expect(restored.apply(new Float64Array(1), mine)).toBe('policy');
  });
});
