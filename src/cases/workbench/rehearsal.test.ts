import loadMujoco from '@mujoco/mujoco';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { fixtureRobots } from '../../sim/fixtures/robots';
import { buildRig } from '../../utils/kinematics';
import { buildCase, builderRobot } from '../caseBuilder';
import { caseRobot } from '../testing';
import { robotPivot } from '../slots';
import { rehearseWorkbench } from './rehearsal';
import { WORKBENCH_TASKS, workbenchTask } from './tasks.fixtures';
import { runCase } from '../runCase';
import { mkdirSync, writeFileSync } from 'node:fs';
import { SimEngine } from '../../sim/engine';
import type { ReferenceCommand } from '../schema';

const arm = fixtureRobots().find((robot) => robot.id === 'arm-6dof')!;
const robot = caseRobot(arm);
let mj: Awaited<ReturnType<typeof loadMujoco>>;
const measurements: Array<{
  task: string;
  preparationMs: number;
  simulationMs: number;
  analysisMs: number;
  ordinaryMs: number;
}> = [];

beforeAll(async () => {
  mj = await loadMujoco();
});

afterAll(() => {
  mkdirSync('scratch', { recursive: true });
  writeFileSync(
    'scratch/workbench-measurements.json',
    JSON.stringify({ platform: process.platform, arch: process.arch, node: process.version, measurements }, null, 2),
  );
});

it.each(WORKBENCH_TASKS.map((name, index) => ({ name, index })))(
  'requires a physical $name verdict at the entered placement and refuses a distant base',
  async ({ index }) => {
    const fixture = workbenchTask(index);
    const { kase, pose, robot: own } = fixture;
    const before = structuredClone(kase);
    const result = await rehearseWorkbench(mj, { unit: 'bench-arm', kase, robot: own, pose });
    const ordinaryStart = performance.now();
    const ordinary = await runCase(mj, fixture.source, own, { controller: 'reference', record: true });
    const ordinaryMs = performance.now() - ordinaryStart;

    measurements.push({
      task: WORKBENCH_TASKS[index],
      preparationMs: result.preparationMs,
      simulationMs: result.simulationMs,
      analysisMs: result.analysisMs,
      ordinaryMs,
    });

    expect(result.rehearsal.passed, JSON.stringify(result.rehearsal)).toBe(true);
    expect(ordinary.passed).toBe(result.rehearsal.passed);
    expect(result.replay!.recording.frames).toBeGreaterThan(50);
    expect(result.identity.unit).toBe('bench-arm');
    expect(kase).toEqual(before);
    expect(result.rehearsal.travelMm).toBeGreaterThan(20);
    expect(result.replay!.kase.task.contract).toEqual(kase.task.contract);
    expect(result.replay!.kase.world.objects.map((object) => [object.size, object.massG, object.friction])).toEqual(
      kase.world.objects.map((object) => [object.size, object.massG, object.friction]),
    );

    const signal = index >= 2 && index <= 5 ? 'fixture-travel' : 'lift';
    const measured = result.replay!.trace.signals[signal];

    expect(Math.max(...measured) - Math.min(...measured)).toBeGreaterThan(2);

    const distant = await rehearseWorkbench(mj, {
      unit: 'bench-arm',
      kase,
      robot: own,
      pose: { ...pose, position: [10000, 0, 0] },
    });

    expect(distant.rehearsal.passed).toBe(false);
    expect(distant.rehearsal.refusal).toMatch(/reach/i);
    expect(distant.replay).toBeNull();
  },
);

it('changes collision outcomes when the base moves within one unchanged workbench', async () => {
  const made = buildCase({ goal: 'drawer', world: 'floor' }, builderRobot(buildRig(arm.joints, arm.parts), arm.parts));

  if (!made.ok) throw new Error(made.problem);

  const kase = structuredClone(made.kase);

  kase.world.objects.push({
    id: 'obstruction',
    name: 'Obstruction',
    kind: 'box',
    position: [120, 180, 0],
    rotation: [0, 0, 0],
    size: [40, 100, 150],
    behavior: 'static',
    color: '#909090',
  });

  const clear = await rehearseWorkbench(mj, {
    unit: 'bench-arm',
    kase,
    robot,
    pose: { position: robotPivot(robot), yawDeg: 0 },
  });
  const position = robotPivot(robot);

  position[0] += 120;

  const result = await rehearseWorkbench(mj, { unit: 'bench-arm', kase, robot, pose: { position, yawDeg: 0 } });

  expect(clear.rehearsal.passed).toBe(true);
  expect(result.rehearsal.passed).toBe(false);
  expect(result.rehearsal.refusal).toMatch(/obstructed/);
});

it('physically rehearses a small translated and rotated base with fixtures fixed', async () => {
  const fixture = workbenchTask(2);
  const pose = { position: [...fixture.pose.position] as [number, number, number], yawDeg: fixture.pose.yawDeg + 3 };

  pose.position[0] += 5;

  const result = await rehearseWorkbench(mj, { ...fixture, unit: 'bench-arm', pose });

  expect(result.rehearsal.passed, JSON.stringify(result.rehearsal)).toBe(true);
});

it.each(['joint', 'mixed', 'velocity', 'orientation', 'late'] as const)(
  'refuses %s reference semantics before stepping',
  async (mode) => {
    const fixture = workbenchTask(2);
    const commands = {
      joint: { at: 0, joints: { arm0: 20 } },
      mixed: { at: 0, joints: { arm0: 20 }, target: [0, 100, 100] },
      velocity: { at: 0, v: [1, 0, 0] },
      orientation: { at: 0, target: [0, 100, 100], orientation: [0, 45, 0] },
      late: { at: fixture.kase.task.seconds + 1, target: [0, 100, 100] },
    };
    const kase = {
      ...fixture.kase,
      reference: { timeline: [...fixture.kase.reference.timeline, commands[mode] as ReferenceCommand] },
    };
    const step = vi.spyOn(SimEngine.prototype, 'step');

    try {
      const result = await rehearseWorkbench(mj, { ...fixture, kase, unit: 'bench-arm' });

      expect(result.rehearsal.passed).toBe(false);
      expect(result.rehearsal.refusal).toBeTruthy();
      expect(result.simulationMs).toBe(0);
      expect(result.replay).toBeNull();
      expect(step).not.toHaveBeenCalled();
    } finally {
      step.mockRestore();
    }
  },
);

it('reports an unresolved solve without treating it as a physical pass', async () => {
  const fixture = workbenchTask(2);
  const robot = {
    ...fixture.robot,
    joints: fixture.robot.joints.map((joint) =>
      joint.type === 'revolute' ? { ...joint, range: [0, 0] as [number, number] } : joint,
    ),
  };
  const result = await rehearseWorkbench(mj, { ...fixture, robot, unit: 'bench-arm' });

  expect(result.rehearsal.passed).toBe(false);
  expect(result.rehearsal.refusal).toMatch(/unresolved/);
  expect(result.replay).toBeNull();
});

it.each(['fixture', 'floor'] as const)(
  'refuses welded base penetration into the %s even if the task contract passes',
  async (fault) => {
    const fixture = workbenchTask(2);
    const kase = structuredClone(fixture.source);
    const pose = { position: robotPivot(fixture.robot), yawDeg: 0 };

    if (fault === 'fixture')
      kase.world.objects.push({
        id: 'base-obstacle',
        name: 'Base obstacle',
        kind: 'box',
        position: [0, 25, 0],
        rotation: [0, 0, 0],
        size: [20, 20, 20],
        behavior: 'static',
        color: '#909090',
      });

    if (fault === 'floor') pose.position[1] -= 10;

    const result = await rehearseWorkbench(mj, { unit: 'bench-arm', robot: fixture.robot, kase, pose });

    expect(result.rehearsal.margin).toBeGreaterThan(0);
    expect(result.rehearsal.passed).toBe(false);
    expect(result.rehearsal.refusal).toMatch(/obstructed/);
  },
);
