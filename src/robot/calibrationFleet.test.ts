import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { playBench } from './benchRun';
import { remount } from './mountCapture';
import type { ServoRobotSpec } from './robotState';
import { connectRobot, receiveRobotEvent, selectUnit, startRobotStore, type RobotLinkApi } from './robotStore';

const SPEC: ServoRobotSpec = { family: 'feetech', ids: [1], class: 'arm', emulated: true };
const sent: Array<{ unit: string | undefined; command: Record<string, unknown> }> = [];
const mounted: Array<{ unit: string | undefined }> = [];

function status(unit: string, at: number, run = 'running') {
  receiveRobotEvent({
    event: 'status',
    unit,
    at_us: at,
    mode: 'test',
    run,
    sealed: false,
    fault_latched: false,
    joints: [{ id: 1, position: 2048 + at / 1000, temp_c: 25, volts: 7.4, torque_on: true, reply: 'ok' }],
  });
}

const link: RobotLinkApi = {
  onRobotEvent: () => () => {},
  robotUnits: async () => [],
  robotConnect: async (spec, unit) => {
    receiveRobotEvent({ event: 'link', state: 'connected', spec, unit });

    return { ok: true };
  },
  robotCommand: async (command, unit) => {
    sent.push({ unit, command });

    if (command.cmd === 'enter') status(unit ?? '', 0);

    return { ok: true };
  },
  robotCalibrate: async (_joints, unit) => {
    mounted.push({ unit });
    selectUnit('arm-b');
    status(unit ?? '', 0, 'held');

    return { ok: true };
  },
};

beforeAll(() => startRobotStore(link));

beforeEach(async () => {
  vi.useFakeTimers();

  for (const unit of ['arm-a', 'arm-b']) {
    await connectRobot(SPEC, ['shoulder'], unit);
    status(unit, 0);
  }

  selectUnit('arm-a');
  sent.length = 0;
  mounted.length = 0;
});

afterEach(() => vi.useRealTimers());

describe('calibration isolation across units', () => {
  it('keeps bench commands and recorded telemetry on the unit selected at its start', async () => {
    const bench = playBench([0], { seconds: 0.1, offset: () => 0.1 });

    selectUnit('arm-b');
    status('arm-b', 5e6, 'held');
    await vi.advanceTimersByTimeAsync(25);
    status('arm-a', 1e5);
    await vi.advanceTimersByTimeAsync(100);
    status('arm-a', 2e5);

    const recording = await bench;

    expect(recording?.samples).toHaveLength(2);
    expect(recording?.samples[0].joints[0].positionRad).toBeCloseTo((100 * 2 * Math.PI) / 4096);
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.every((s) => s.unit === 'arm-a')).toBe(true);
  });

  it('ends the bench when its own unit stops while another unit remains running', async () => {
    const bench = playBench([0], { seconds: 0.1, offset: () => 0.1 });

    selectUnit('arm-b');
    status('arm-a', 1e5, 'held');
    await vi.advanceTimersByTimeAsync(1200);

    expect(await bench).toBeNull();
    expect(sent.every((s) => s.unit === 'arm-a')).toBe(true);
  });

  it('re-enters Test on the unit whose mounts were rewritten after selection changes', async () => {
    expect(await remount([{ zeroCounts: 2100, direction: -1 }])).toBe(true);
    expect(mounted).toEqual([{ unit: 'arm-a' }]);
    expect(sent).toEqual([{ unit: 'arm-a', command: { cmd: 'enter', mode: 'test' } }]);
  });

  it('ends a background bench on its own fault before a stopped status arrives', async () => {
    const bench = playBench([0], { seconds: 0.1, offset: () => 0.1 });

    selectUnit('arm-b');
    receiveRobotEvent({ event: 'fault', unit: 'arm-a', code: 'stall', message: 'The joint is stuck.' });
    await vi.advanceTimersByTimeAsync(1200);

    expect(await bench).toBeNull();
    expect(sent.every((s) => s.unit === 'arm-a')).toBe(true);
  });
});
