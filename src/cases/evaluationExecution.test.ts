import loadMujoco from '@mujoco/mujoco';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../types/robotics';
import { evaluationWorkflow } from './evaluationMatrix.fixtures';
import { caseRobot, presetCase } from './testing';
import { SimEngine } from '../sim/engine';
import { caseRunner } from './runCase';

afterEach(() => vi.restoreAllMocks());

let mj: Awaited<ReturnType<typeof loadMujoco>>;

beforeAll(async () => {
  mj = await loadMujoco();
});

it('pins Case coordinates despite a changed robot reach and separates world jitter from physics draws', async () => {
  const robot = fixtureRobots().find((value) => value.id === 'rover-diff')!;
  const kase = presetCase(robot, 'reach-the-flag');
  const changed = {
    ...robot,
    parts: robot.parts.map((part) => ({
      ...part,
      position: [part.position[0] + 100, part.position[1], part.position[2]] as [number, number, number],
    })),
  };
  const baseline = await caseRunner(mj, kase, caseRobot(robot), {
    controller: 'reference',
    fixedCase: true,
    worldRandomization: false,
  }).run(7);
  const candidate = await caseRunner(mj, kase, caseRobot(changed), {
    controller: 'reference',
    fixedCase: true,
    worldRandomization: false,
  }).run(7);

  expect(baseline.case).toEqual(kase);
  expect(candidate.case).toEqual(kase);
  expect(candidate.model.xml).not.toEqual(baseline.model.xml);
});

it('passes the source project through calibrated model preparation and releases a cancelled rollout', async () => {
  const robot = fixtureRobots().find((value) => value.id === 'rover-diff')!;
  const kase = presetCase(robot, 'reach-the-flag');
  const disposed = vi.spyOn(SimEngine.prototype, 'dispose');
  let checkpoints = 0;
  const runner = caseRunner(mj, kase, caseRobot(robot), {
    controller: 'reference',
    project: { ...DEFAULT_PROJECT, joints: robot.joints },
    checkpoint: async () => {
      checkpoints++;

      if (checkpoints === 1) return;

      throw new Error('cancelled');
    },
  });

  await expect(runner.run(3)).rejects.toThrow('cancelled');
  expect(checkpoints).toBe(2);
  expect(disposed).toHaveBeenCalledTimes(1);
  expect(
    (await caseRunner(mj, kase, caseRobot(robot), { controller: 'reference' }).run()).frames.length,
  ).toBeGreaterThan(0);
});

it('applies the frozen active body calibration instead of borrowing a preset model', async () => {
  const robot = fixtureRobots().find((value) => value.id === 'arm-3dof')!;
  const kase = presetCase(robot, 'touch-the-dots');
  const baseline = await caseRunner(mj, kase, caseRobot(robot), { controller: 'reference', fixedCase: true }).run();
  const key = baseline.model.robots[0].key;
  const leaf = baseline.model.bodies.find((body) => body.joint === 'arm2')!;
  const calibration = {
    version: 1,
    verdict: 'measured' as const,
    robot: key,
    fit: { massScales: { [leaf.name]: 2 }, payloadKg: { [leaf.name]: 0.2 }, floorFrictionScale: 0.5 },
    evidence: { presetErrorRad: 0.1, fittedErrorRad: 0.04, gain: 0.6 },
    modelFingerprint: baseline.model.robots[0].fingerprint,
  };
  const project = {
    ...DEFAULT_PROJECT,
    joints: robot.joints,
    bodyCalibrations: { [key]: { versions: [calibration], active: 1 } },
  };
  const calibrated = await caseRunner(mj, kase, caseRobot(robot), {
    controller: 'reference',
    fixedCase: true,
    project,
  }).run();

  expect(calibrated.model.xml).not.toBe(baseline.model.xml);
  expect(calibrated.model.robots[0].fingerprint).not.toBe(baseline.model.robots[0].fingerprint);
  expect(calibrated.case).toEqual(baseline.case);
});

it('separates fixed world placements from seeded dynamic-world jitter and independently reproduces the randomized pickup', async () => {
  const robot = fixtureRobots().find((value) => value.id === 'arm-6dof')!;
  const { kase } = evaluationWorkflow('fixed-arm pickup');
  const fixed = await caseRunner(mj, kase, caseRobot(robot), {
    controller: 'reference',
    fixedCase: true,
    worldRandomization: false,
    record: true,
  }).run(7);
  const random = await caseRunner(mj, kase, caseRobot(robot), {
    controller: 'reference',
    fixedCase: true,
    record: true,
  }).run(7);
  const repeat = await caseRunner(mj, kase, caseRobot(robot), {
    controller: 'reference',
    fixedCase: true,
    record: true,
  }).run(7);

  expect(fixed.case.world).toEqual(kase.world);
  expect(random.case.world).not.toEqual(fixed.case.world);
  expect(repeat.case).toEqual(random.case);
  expect(repeat.margin).toBe(random.margin);
  expect(repeat.recording!.poses).toEqual(random.recording!.poses);
});
