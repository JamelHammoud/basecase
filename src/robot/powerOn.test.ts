import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { statusWithLinkAngles, type Horn } from '../../electron/robot/emulatedHorns.mjs';
import { activeMount, EMPTY_HISTORY, recordMount, type CalibrationHistory } from '../reality/history';
import type { JointMount } from '../reality/types';
import type { RobotJoint } from '../types/robotics';
import { playBench } from './benchRun';
import { checkPowerOn, fixPowerOn, powerOnState, resetPowerOn, skipPowerOnStep } from './powerOn';
import { REFERENCE_PLAN, TEST_CAPS, WIGGLE_PLAN, withinTestCaps } from './powerOnCheck';
import { connectRobot, receiveRobotEvent, robotHomeJoints, robotSceneJoints, startRobotStore } from './robotStore';
import { remount, robotMounts } from './mountCapture';
import { radiansFromCounts, servoFamily, type RobotEvent, type RobotStatus } from './robotState';

vi.mock('./benchRun', async (original) => ({ ...(await original<typeof import('./benchRun')>()), playBench: vi.fn() }));
vi.mock('./mountCapture', async (original) => ({
  ...(await original<typeof import('./mountCapture')>()),
  remount: vi.fn(),
}));

const COUNTS_PER_RAD = 4096 / (2 * Math.PI);
const FAMILIES = ['feetech', 'dynamixel'] as const;
const STRAIGHT: Horn = { offsetCounts: 0, direction: 1 };
const REVERSED: Horn = { offsetCounts: 0, direction: -1 };

const joint = (n: number, limb: RobotJoint['limb'] = 'arm'): RobotJoint => ({
  id: `joint-${n}`,
  name: `Joint ${n}`,
  type: 'revolute',
  parent: [`link-${n - 1}`],
  child: [`link-${n}`],
  origin: [0, n, 0],
  axis: [0, 0, 1],
  limb,
});

const design = (count: number, limb?: RobotJoint['limb']) =>
  Array.from({ length: count }, (_, k) => joint(k + 1, limb));

interface Wiring {
  count: number;
  limb?: RobotJoint['limb'];
  horns?: Record<number, Horn>;
  missing?: number;
  duplicate?: number;
}

interface Case {
  name: string;
  wiring: Wiring;
  outcome: 'confirmed' | 'refused';
  named: string;
  fixed?: boolean;
}

const swap = (a: number, b: number): Record<number, Horn> => ({
  [a]: { ...STRAIGHT, drives: b },
  [b]: { ...STRAIGHT, drives: a },
});

const CASES: Case[] = [
  { name: 'correct wiring', wiring: { count: 3 }, outcome: 'confirmed', named: '' },
  {
    name: 'a swapped pair',
    wiring: { count: 3, horns: swap(1, 2) },
    outcome: 'refused',
    named: 'Motor 1 moves Joint 2, not Joint 1.',
    fixed: true,
  },
  {
    name: 'one reversed joint',
    wiring: { count: 3, horns: { 2: REVERSED } },
    outcome: 'refused',
    named: 'Joint 2 turns the wrong way.',
    fixed: true,
  },
  {
    name: 'two reversed joints',
    wiring: { count: 3, horns: { 1: REVERSED, 3: REVERSED } },
    outcome: 'refused',
    named: 'Joint 1 turns the wrong way.',
    fixed: true,
  },
  {
    name: 'a wrong offset',
    wiring: { count: 3, horns: { 3: { offsetCounts: 120, direction: 1 } } },
    outcome: 'refused',
    named: 'Joint 3 starts 11° off zero.',
    fixed: true,
  },
  { name: 'a missing motor', wiring: { count: 3, missing: 2 }, outcome: 'refused', named: 'Joint 2 doesn’t answer.' },
  { name: 'a duplicate id', wiring: { count: 3, duplicate: 3 }, outcome: 'refused', named: 'Joint 3 shares its ID.' },
  { name: 'a hexapod with 18 joints', wiring: { count: 18, limb: 'leg' }, outcome: 'confirmed', named: '' },
  { name: 'a pan-tilt with two', wiring: { count: 2 }, outcome: 'confirmed', named: '' },
];

let rig: Wiring = { count: 3 };
let skipAt: number | null = null;
const moved: number[][] = [];
let histories: Record<string, CalibrationHistory> = {};
let unitCount = 0;

const hornFor = (id: number): Horn => rig.horns?.[id] ?? STRAIGHT;

function statusAt(unit: string, counts: number[], extra: Partial<RobotStatus> = {}): RobotStatus {
  const base = {
    event: 'status',
    unit,
    mode: 'test',
    run: 'running',
    sealed: false,
    fault_latched: false,
    ...extra,
    joints: counts.map((position, k) => ({
      id: k + 1,
      position,
      temp_c: 30,
      volts: 7.4,
      torque_on: true,
      reply: rig.missing === k + 1 ? 'no_reply' : 'ok',
    })),
  };

  return statusWithLinkAngles(base, hornFor) as unknown as RobotStatus;
}

const beliefs = new Map<string, JointMount[]>();

function simulatedBench(unit: string) {
  return async (
    moving: readonly number[] | undefined,
    plan: typeof WIGGLE_PLAN,
    hear?: (status: RobotStatus) => void,
  ) => {
    const count = rig.count;
    const subset = moving ?? Array.from({ length: count }, (_, k) => k);
    const belief =
      beliefs.get(unit) ?? Array.from({ length: count }, () => ({ zeroCounts: 2048, direction: 1 as const }));

    moved.push([...subset]);

    if (rig.duplicate && subset.includes(rig.duplicate - 1)) {
      receiveRobotEvent({
        event: 'fault',
        unit,
        code: 'duplicate_id',
        message: `Two servos answer to ID ${rig.duplicate}.`,
      });
      receiveRobotEvent(
        statusAt(unit, Array(count).fill(2048), { run: 'stopped', fault_latched: true }) as unknown as RobotEvent,
      );

      return null;
    }

    if (skipAt !== null && subset.length === 1 && subset[0] === skipAt) {
      skipAt = null;
      skipPowerOnStep();
    }

    const samples = [];

    for (let t = 0; t <= plan.seconds; t += 0.25) {
      const counts = Array.from(
        { length: count },
        (_, k) => 2048 + (subset.includes(k) ? belief[k].direction * plan.offset(t) * COUNTS_PER_RAD : 0),
      );
      const status = statusAt(unit, counts);

      receiveRobotEvent(status as unknown as RobotEvent);
      hear?.(status);
      samples.push({ seconds: t, joints: subset.map(() => ({ positionRad: 0, volts: 7.4, temperatureC: 30 })) });
    }

    return { starts: subset.map(() => 0), samples };
  };
}

beforeAll(() => {
  startRobotStore({
    onRobotEvent: () => () => {},
    robotUnits: async () => [],
    robotConnect: async (spec, unit) => {
      receiveRobotEvent({ event: 'link', state: 'connected', spec, unit });
      receiveRobotEvent({ event: 'hello', unit, emulated: true });
      receiveRobotEvent({
        event: 'calibration',
        unit,
        joints: (spec as { ids: number[] }).ids.map((id: number) => ({ id, zero_counts: 2048, direction: 1 })),
      });
      receiveRobotEvent(
        statusAt(unit as string, Array((spec as { ids: number[] }).ids.length).fill(2048)) as unknown as RobotEvent,
      );

      return { ok: true };
    },
  });
});

async function plug(family: (typeof FAMILIES)[number], wiring: Wiring) {
  rig = wiring;
  skipAt = null;
  moved.length = 0;
  histories = {};
  resetPowerOn();

  const joints = design(wiring.count, wiring.limb);
  const unit = `unit-${++unitCount}`;
  const spec = {
    family,
    ids: joints.map((_, k) => k + 1),
    class: wiring.limb === 'leg' ? 'legged' : 'arm',
    emulated: true,
  } as const;

  beliefs.delete(unit);
  await connectRobot(
    spec,
    joints.map((j) => j.id),
    unit,
  );
  vi.mocked(playBench).mockImplementation(simulatedBench(unit) as never);
  vi.mocked(remount).mockImplementation(async (mounts) => {
    beliefs.set(unit, [...mounts]);
    receiveRobotEvent({ event: 'calibration', unit, joints: robotMounts(mounts, unit) });

    return true;
  });

  return {
    unit,
    joints,
    input: () => ({
      unit,
      joints,
      parts: [],
      calibrations: histories,
      record: (jointId: string, found: Parameters<typeof recordMount>[1]) => {
        histories[jointId] = recordMount(histories[jointId] ?? EMPTY_HISTORY, found);
      },
    }),
  };
}

beforeEach(() => {
  vi.mocked(playBench).mockReset();
  vi.mocked(remount).mockReset();
});

describe.each(FAMILIES)('first power-on on a %s robot', (family) => {
  it.each(CASES)('ends in an explicit state for $name', async ({ wiring, outcome, named, fixed }) => {
    const { input, joints, unit } = await plug(family, wiring);

    expect(servoFamily({ family } as never)).toBe(family);
    await checkPowerOn(input());

    const first = powerOnState();

    expect(first.unit).toBe(unit);
    expect(first.outcome).toBe(outcome);
    expect(first.running).toBe(false);

    if (outcome === 'confirmed') {
      joints.forEach((j) => expect(activeMount(histories[j.id])).not.toBeNull());

      return;
    }

    const refused = first.findings[0];

    expect(first.refusal?.message).toBe(named);
    expect(joints.map((j) => j.id)).toContain(first.refusal?.jointId);
    expect(refused ? refused.jointId : first.refusal?.jointId).toBe(first.refusal?.jointId);
    expect(Object.keys(histories)).toEqual([]);

    if (!fixed) return;

    expect(await fixPowerOn(input())).toBe(true);
    expect(Object.keys(histories).length).toBeGreaterThan(0);
    await checkPowerOn(input());
    expect(powerOnState().outcome).toBe('confirmed');
    expect(powerOnState().refusal).toBeNull();

    if (!wiring.horns?.[1]?.drives) return;

    expect(robotSceneJoints(unit)?.slice(0, 2)).toEqual(['joint-2', 'joint-1']);
    expect(robotHomeJoints(unit)).toEqual(joints.map((j) => j.id));
  });

  it('resumes a skipped step with only the steps left', async () => {
    const { input } = await plug(family, { count: 3 });

    skipAt = 1;
    await checkPowerOn(input());

    expect(powerOnState().outcome).toBe('paused');
    expect(powerOnState().skipped).toEqual(['joint-2']);
    expect(Object.keys(histories)).toEqual([]);
    moved.length = 0;
    await checkPowerOn(input());
    expect(moved[0]).toEqual([1]);
    expect(powerOnState().outcome).toBe('confirmed');
    expect(Object.keys(histories)).toHaveLength(3);
  });

  it('stands down when the robot goes away', async () => {
    const { input, unit } = await plug(family, { count: 3 });

    vi.mocked(playBench).mockImplementation(async () => {
      receiveRobotEvent({ event: 'link', state: 'closed', unit });

      return null;
    });
    await checkPowerOn(input());
    expect(powerOnState()).toMatchObject({ running: false, outcome: null, step: null });
  });
});

describe('Test caps', () => {
  it('keeps both plans within the daemon’s Test speed', () => {
    expect(TEST_CAPS.speedRadPerS).toBe(0.5);
    expect(withinTestCaps(WIGGLE_PLAN)).toBe(true);
    expect(withinTestCaps(REFERENCE_PLAN)).toBe(true);
    expect(withinTestCaps({ seconds: 3, offset: (seconds) => seconds })).toBe(false);
    expect(withinTestCaps({ seconds: 31, offset: () => 0 })).toBe(false);
    expect(radiansFromCounts(2048, { zero_counts: 2048, direction: 1 })).toBe(0);
  });
});
