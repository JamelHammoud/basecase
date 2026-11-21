import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { playBench, playBenchTrajectory } from './benchRun';
import {
  connectRobot,
  receiveRobotEvent,
  robotBenchDriving,
  selectUnit,
  sendUnitCommand,
  startRobotStore,
  type RobotLinkApi,
} from './robotStore';
import type { RobotEvent } from './robotState';

const commands: Array<{ unit: string | undefined; command: Record<string, unknown> }> = [];
const spec = { family: 'feetech', ids: [1, 2], class: 'arm', emulated: true } as const;
const ids = ['shoulder', 'elbow'];
const points = [
  { at: 0, joints: [0, 0] },
  { at: 100, joints: [0.02, -0.01] },
  { at: 200, joints: [0, 0.01] },
];
let refuse = false;

const link: RobotLinkApi = {
  onRobotEvent: () => () => {},
  robotConnect: async (ask, unit) => {
    receiveRobotEvent({ event: 'link', unit, state: 'connected', spec: ask });

    return { ok: true };
  },
  robotCommand: async (command, unit) => {
    commands.push({ command, unit });

    return refuse ? { ok: false, message: 'refused' } : { ok: true };
  },
};

function status(unit = 'arm-a', extra: Partial<RobotEvent> = {}) {
  receiveRobotEvent({
    event: 'status',
    unit,
    at_us: performance.now() * 1000,
    mode: 'test',
    run: 'running',
    sealed: false,
    fault_latched: false,
    joints: [1, 2].map((id) => ({ id, position: 2048, torque_on: true, reply: 'ok' })),
    ...extra,
  });
}

async function advance(ms: number) {
  for (let elapsed = 0; elapsed < ms; elapsed += 25) {
    await vi.advanceTimersByTimeAsync(25);
    status();
    status('arm-b');
  }
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  startRobotStore(link);
  refuse = false;
  commands.length = 0;
  await connectRobot({ ...spec, ids: [...spec.ids] }, ids, 'arm-a');
  await connectRobot({ ...spec, ids: [...spec.ids] }, ids, 'arm-b');
  selectUnit('arm-a');
  status();
  status('arm-b');
});

afterEach(() => {
  receiveRobotEvent({ event: 'link', unit: 'arm-a', state: 'closed' });
  receiveRobotEvent({ event: 'link', unit: 'arm-b', state: 'closed' });
  vi.useRealTimers();
});

describe('selected bench trajectories', () => {
  it('delivers distinct absolute joint targets to only its bound unit and keeps received observations', async () => {
    const running = playBenchTrajectory({ unit: 'arm-a', joints: ids, points });

    await advance(225);

    const outcome = await running;
    const intents = commands.filter(({ command }) => command.cmd === 'intent');

    expect(outcome.kind).toBe('completed');
    expect(intents.every(({ unit }) => unit === 'arm-a')).toBe(true);
    expect(intents).toContainEqual({ unit: 'arm-a', command: { cmd: 'intent', joints: [0.02, -0.01] } });
    expect(outcome.run.intents.some((intent) => intent.joints[0] !== intent.joints[1])).toBe(true);
    expect(outcome.run.statuses.every((sample) => sample.positions.every((value) => value === 0))).toBe(true);
    expect(robotBenchDriving('arm-a')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([0, 25, 100, 175])('cancels at %i ms without a return or later command', async (at) => {
    const controller = new AbortController();
    const running = playBenchTrajectory({ unit: 'arm-a', joints: ids, points, signal: controller.signal });

    await advance(at);
    controller.abort();

    const count = commands.length;
    const outcome = await running;

    await advance(300);
    expect(outcome.kind).toBe('cancelled');
    expect(commands.at(-1)).toEqual({ unit: 'arm-a', command: { cmd: 'stop' } });
    expect(commands).toHaveLength(count);
    expect(robotBenchDriving('arm-a')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['link', 'calibration', 'fault', 'stopped'])(
    'terminates on %s without commanding a replacement',
    async (event) => {
      const running = playBenchTrajectory({ unit: 'arm-a', joints: ids, points });

      await advance(50);
      receiveRobotEvent({ event, unit: 'arm-a', state: 'connected', spec, joints: [] });

      const outcome = await running;
      const count = commands.length;

      await advance(300);
      expect(outcome.kind).not.toBe('completed');
      expect(commands).toHaveLength(count);
      expect(robotBenchDriving('arm-a')).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('refuses duplicate activation, reordered joints, missing readings and an approach from another start', async () => {
    const running = playBenchTrajectory({ unit: 'arm-a', joints: ids, points });

    expect((await playBenchTrajectory({ unit: 'arm-a', joints: ids, points })).kind).toBe('refused');
    expect(await playBench(undefined, { seconds: 1, offset: () => 0 }, undefined, 'arm-a')).toBeNull();
    await advance(225);
    await running;
    expect((await playBenchTrajectory({ unit: 'arm-a', joints: [...ids].reverse(), points })).kind).toBe('refused');
    expect(
      (await playBenchTrajectory({ unit: 'arm-a', joints: ids, points: points.map((p) => ({ ...p, joints: [1, 0] })) }))
        .kind,
    ).toBe('refused');
    status('arm-a', { joints: [] });
    expect((await playBenchTrajectory({ unit: 'arm-a', joints: ids, points })).kind).toBe('refused');
  });

  it('stops when current source bindings change or a command is refused', async () => {
    let current = true;
    const running = playBenchTrajectory({ unit: 'arm-a', joints: ids, points, current: () => current });

    await advance(50);
    current = false;
    await advance(25);
    expect((await running).kind).toBe('stale');
    expect(commands.at(-1)?.command.cmd).toBe('stop');

    const rejected = playBenchTrajectory({ unit: 'arm-a', joints: ids, points });

    refuse = true;
    await advance(25);
    expect((await rejected).kind).toBe('command-refused');
  });

  it('releases its owner on a unit switch, a competing command or a broken source predicate', async () => {
    const switched = playBenchTrajectory({ unit: 'arm-a', joints: ids, points });

    await advance(25);
    selectUnit('arm-b');
    await advance(25);
    expect((await switched).kind).toBe('stale');
    selectUnit('arm-a');

    const competed = playBenchTrajectory({ unit: 'arm-a', joints: ids, points });

    await sendUnitCommand('arm-a', { cmd: 'stop' });
    expect((await competed).kind).toBe('cancelled');

    let broken = false;
    const failed = playBenchTrajectory({
      unit: 'arm-a',
      joints: ids,
      points,
      current: () => {
        if (broken) throw new Error('source unavailable');

        return true;
      },
    });

    broken = true;
    await advance(25);
    expect((await failed).kind).toBe('stale');
    expect(robotBenchDriving('arm-a')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('retains missing observations as missing, stops and releases timers', async () => {
    const running = playBenchTrajectory({ unit: 'arm-a', joints: ids, points });

    await advance(25);
    await vi.advanceTimersByTimeAsync(1);
    status('arm-a', { joints: [{ id: 1, position: 2048, torque_on: true }] });

    const result = await running;

    expect(result.kind).toBe('telemetry');
    expect(result.run.statuses.at(-1)?.positions).toEqual([0, null]);
    expect(vi.getTimerCount()).toBe(0);
    expect(robotBenchDriving('arm-a')).toBe(false);
  });

  it('does not turn missing telemetry into successful completion', async () => {
    const running = playBenchTrajectory({ unit: 'arm-a', joints: ids, points });

    await vi.advanceTimersByTimeAsync(1500);
    expect((await running).kind).toBe('telemetry');
    expect(commands.at(-1)?.command.cmd).toBe('stop');
    expect(vi.getTimerCount()).toBe(0);
  });
});
