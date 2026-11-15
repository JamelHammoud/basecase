import { describe, expect, it, vi } from 'vitest';
import { ControlDelay } from './controlDelay';

describe('control latency', () => {
  it.each([0, 1, 2, 20, 40])('holds every channel back %i steps through startup and repeated wraps', (steps) => {
    const delay = new ControlDelay();
    const ctrl = new Float64Array(8);
    const commands = Array.from({ length: 600 }, (_, tick) =>
      Float64Array.from({ length: ctrl.length }, (_, channel) => Math.sin(tick + channel) * (channel + 1)),
    );

    delay.reset(steps);

    for (let tick = 0; tick < commands.length; tick++) {
      ctrl.set(commands[tick]);
      delay.apply(ctrl);
      expect(ctrl).toEqual(commands[Math.max(0, tick - steps)]);
    }
  });

  it('reuses bounded history after warmup and allocates nothing when disabled', () => {
    const delay = new ControlDelay();
    const ctrl = new Float64Array(8);
    const copies = vi.spyOn(Float64Array, 'from');

    try {
      for (let tick = 0; tick < 600; tick++) delay.apply(ctrl);

      expect(copies).not.toHaveBeenCalled();
      delay.reset(20);

      for (let tick = 0; tick < 600; tick++) {
        ctrl.fill(tick);
        delay.apply(ctrl);
      }

      expect(copies).toHaveBeenCalledTimes(21);
      expect(ctrl).toEqual(new Float64Array(8).fill(579));
      copies.mockClear();

      for (let tick = 0; tick < 600; tick++) delay.apply(ctrl);

      expect(copies).not.toHaveBeenCalled();
    } finally {
      copies.mockRestore();
    }
  });

  it('starts fresh after changes, including a different control width and no controls', () => {
    const delay = new ControlDelay();
    const ctrl = new Float64Array(3);

    delay.reset(2);
    ctrl.fill(7);
    delay.apply(ctrl);
    ctrl.fill(9);
    delay.apply(ctrl);
    delay.reset(1);
    expect(delay.steps).toBe(1);
    ctrl.fill(-3);
    delay.apply(ctrl);
    expect(Array.from(ctrl)).toEqual([-3, -3, -3]);
    ctrl.fill(4);
    delay.apply(ctrl);
    expect(Array.from(ctrl)).toEqual([-3, -3, -3]);
    delay.reset();
    expect(delay.steps).toBe(0);
    ctrl.fill(11);
    delay.apply(ctrl);
    expect(Array.from(ctrl)).toEqual([11, 11, 11]);
    delay.reset(2);

    const narrow = new Float64Array([5]);

    delay.apply(narrow);
    narrow.fill(8);
    delay.apply(narrow);
    expect(Array.from(narrow)).toEqual([5]);
    delay.reset(1);

    for (let tick = 0; tick < 10; tick++) delay.apply(new Float64Array());
  });
});
