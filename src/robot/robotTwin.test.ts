import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildRig, poseDeltas } from '../utils/kinematics';
import { playBench } from './benchRun';
import { GAP_LIMIT_RAD, LAG_HOLD_MS, LagWatch } from './robotGap';
import { robotGhost } from './robotGhost';
import { radiansFromCounts, type RobotSpec } from './robotState';
import { connectRobot, receiveRobotEvent, startRobotStore, type RobotLinkApi } from './robotStore';
import { noteSimAngles, subscribeTwin, twinSnapshot } from './robotTwin';

const counts = (rad: number) => Math.round(2048 + (rad * 4096) / (2 * Math.PI));

const fake = { held: [0, 0], intents: [] as number[][] };

const link: RobotLinkApi = {
  onRobotEvent: () => () => {},
  robotState: async () => ({ connected: false, spec: null, hello: null, status: null }),
  robotConnect: async () => ({ ok: true }),
  robotDisconnect: async () => ({ ok: true }),
  robotCommand: async (command: Record<string, unknown>) => {
    if (command.cmd === 'intent') {
      fake.held = command.joints as number[];
      fake.intents.push(fake.held);
    }

    return { ok: true };
  },
};

const status = (positions: number[], atUs?: number) =>
  receiveRobotEvent({
    event: 'status',
    at_us: atUs,
    mode: 'test',
    run: 'running',
    sealed: false,
    fault_latched: false,
    joints: positions.map((rad, k) => ({ id: k + 1, position: counts(rad), reply: 'ok' })),
  });

async function connect(joints: string[]) {
  const spec: RobotSpec = { family: 'feetech', ids: joints.map((_, k) => k + 1), class: 'arm', emulated: true };

  receiveRobotEvent({ event: 'link', state: 'connected', spec });
  await connectRobot(spec, joints);
  receiveRobotEvent({ event: 'mode', mode: 'test' });
}

const at = (ms: number) => vi.spyOn(performance, 'now').mockReturnValue(ms);

beforeAll(() => {
  startRobotStore(link);
  subscribeTwin(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('the measured robot', () => {
  it('poses the ghost from status counts exactly as poseDeltas would, and moves only the robot’s links', () => {
    const arm = fixtureRobots().find((r) => r.id === 'arm-3dof')!;
    const rig = buildRig(arm.joints, arm.parts);
    const ids = arm.parts.map((p) => p.id);
    const measured = [3072, 1024, 2560].map(radiansFromCounts);
    const ghost = robotGhost(rig, ids, {
      joints: ['arm0', 'arm1', 'arm2'],
      measured,
      largest: { joint: 'arm1', gap: (12 * Math.PI) / 180 },
    });
    const expected = poseDeltas(rig, { values: { arm0: 90, arm1: -90, arm2: 45 } }, ids);

    expect(ghost.parts).toEqual(['link0', 'link1', 'link2']);
    expect(ghost.values).toEqual({ arm0: 90, arm1: -90, arm2: 45 });
    expect([...ghost.deltas.keys()]).toEqual([...expected.keys()]);

    for (const [id, matrix] of expected)
      ghost.deltas.get(id)!.elements.forEach((v, i) => expect(v).toBeCloseTo(matrix.elements[i], 9));

    expect(ghost.label?.text).toBe('+12.0°');
    [0, 50, 70].forEach((v, i) => expect(ghost.label?.at[i]).toBeCloseTo(v, 6));
  });

  it('measures each gap against the sim angle at the status event’s time, not the latest one', async () => {
    await connect(['a', 'b']);
    at(1000);
    noteSimAngles(['b', 'a'], [0, 0]);
    status([0, 0], 0);
    at(1500);
    noteSimAngles(['b', 'a'], [0.5, 0.4]);
    at(1600);
    status([0.1, -0.2], 200000);

    const twin = twinSnapshot()!;

    expect(twin.sim).toEqual([0, 0]);
    expect(twin.gaps[0]).toBeCloseTo(radiansFromCounts(counts(0.1)), 9);
    expect(twin.gaps[1]).toBeCloseTo(radiansFromCounts(counts(-0.2)), 9);
    expect(twin.largest?.joint).toBe('b');

    at(1700);
    status([0.4, 0.5], 600000);
    expect(twinSnapshot()!.sim).toEqual([0.4, 0.5]);

    at(1800);
    noteSimAngles(['a', 'b'], [0.1 + 2 * Math.PI, 0]);
    status([0.3, 0], 800000);
    expect(twinSnapshot()!.gaps[0]).toBeCloseTo(radiansFromCounts(counts(0.3)) - 0.1, 9);
  });

  it('offers a fix only once a joint has lagged for two seconds while moving', () => {
    const watch = new LagWatch();
    const big = GAP_LIMIT_RAD * 2;

    for (let ms = 0; ms <= LAG_HOLD_MS + 100; ms += 100)
      watch.note({ atMs: ms, joints: ['a', 'b'], measured: [ms / 1000, ms / 1000], gaps: [big, GAP_LIMIT_RAD / 2] });

    expect([...watch.lagging]).toEqual(['a']);

    const still = new LagWatch();

    for (let ms = 0; ms <= LAG_HOLD_MS + 100; ms += 100)
      still.note({ atMs: ms, joints: ['a'], measured: [ms / 1000], gaps: [ms === 1000 ? 0 : big] });

    expect(still.lagging.size).toBe(0);
  });

  it('benches one joint while holding the others, and logs only that joint', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
    await connect(['a', 'b']);
    fake.intents = [];

    const tick = setInterval(() => status(fake.held, Math.round(performance.now() * 1000)), 100);

    status([0.2, -0.1], 0);

    const recording = playBench([1]);

    await vi.advanceTimersByTimeAsync(19000);
    clearInterval(tick);

    const done = (await recording)!;

    expect(done.starts).toHaveLength(1);
    expect(done.starts[0]).toBeCloseTo(radiansFromCounts(counts(-0.1)), 9);
    expect(done.samples.length).toBeGreaterThan(100);
    expect(done.samples.every((s) => s.joints.length === 1)).toBe(true);
    expect(new Set(fake.intents.map((joints) => joints[0])).size).toBe(1);
    expect(new Set(fake.intents.map((joints) => joints[1])).size).toBeGreaterThan(10);
  });
});
