import { describe, expect, it, vi } from 'vitest';
import type { ServoRobotSpec } from './robotState';
import { connectRobot, receiveRobotEvent, selectUnit, startRobotStore } from './robotStore';
import { noteSimAngles, subscribeTwin, twinSnapshot } from './robotTwin';

const spec: ServoRobotSpec = { family: 'feetech', ids: [1], class: 'arm', emulated: true };

const report = (unit: string, position: number) =>
  receiveRobotEvent({
    event: 'status',
    unit,
    at_us: 0,
    mode: 'test',
    run: 'running',
    sealed: false,
    fault_latched: false,
    joints: [{ id: 1, position, reply: 'ok' }],
  });

describe('the selected unit’s measured twin', () => {
  it('clears the prior unit’s clock and sim trace even when their specifications share an object', async () => {
    startRobotStore({
      onRobotEvent: () => () => {},
      robotUnits: async () => [],
      robotConnect: async (ask, unit) => {
        receiveRobotEvent({ event: 'link', state: 'connected', spec: ask, unit });

        return { ok: true };
      },
    });
    subscribeTwin(() => {});
    await connectRobot(spec, ['shoulder'], 'arm-a');
    await connectRobot(spec, ['shoulder'], 'arm-b');

    const now = vi.spyOn(performance, 'now').mockReturnValue(1000);

    try {
      noteSimAngles(['shoulder'], [0.1]);
      report('arm-a', 2100);
      report('arm-b', 2300);
      expect(twinSnapshot()?.sim).toEqual([0.1]);
      now.mockReturnValue(1100);
      selectUnit('arm-b');
      expect(twinSnapshot()?.sim).toBeNull();
      expect(twinSnapshot()?.measured[0]).toBeCloseTo(((2300 - 2048) * 2 * Math.PI) / 4096);
      expect(twinSnapshot()?.lagging.size).toBe(0);
    } finally {
      now.mockRestore();
    }
  });
});
