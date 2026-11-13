import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { caseFindings, caseRow } from '../readiness/caseChecks';
import { fixtureRobots } from '../sim/fixtures/robots';
import type { FixtureRobot } from '../sim/fixtures/parts';
import { buildRig } from '../utils/kinematics';
import { buildCase, builderRobot } from './caseBuilder';
import { caseRunner } from './runCase';
import { CASE_RUNS, runCaseTimes, summarizeRuns } from './caseRuns';
import type { Case } from './schema';
import { caseTemplates } from './templates';
import { caseRobot } from './testing';

const fixture = (id: string) => fixtureRobots().find((r) => r.id === id)!;

const template = (robot: FixtureRobot, id: string): Case =>
  caseTemplates(buildRig(robot.joints, robot.parts), robot.parts)
    .find((t) => t.id === id)!
    .build();

const withWheelEffort = (robot: FixtureRobot, effortNm: number): FixtureRobot => ({
  ...robot,
  joints: robot.joints.map((j) => ({ ...j, effortNm })),
});

const SMALL_GEAR_MOTOR_NM = 0.25;

describe('seeded Case runs', () => {
  it('give the same result for the same seed, and vary between seeds', async () => {
    const mj = await loadMujoco();
    const rover = fixture('rover-diff');
    const runner = caseRunner(mj, template(rover, 'reach-the-flag'), caseRobot(rover), { controller: 'reference' });
    const [a, again, other] = [await runner.run(7), await runner.run(7), await runner.run(8)];

    expect(again.margin).toBe(a.margin);
    expect(again.passed).toBe(a.passed);
    expect(other.margin).not.toBe(a.margin);
  });

  it('jitter where dynamic world objects start, the same way for the same seed', async () => {
    const mj = await loadMujoco();
    const rover = fixture('rover-four');
    const made = buildCase(
      { goal: 'push', world: 'floor' },
      builderRobot(buildRig(rover.joints, rover.parts), rover.parts),
    );

    if (!made.ok) throw new Error(made.problem);

    const runner = caseRunner(mj, made.kase, caseRobot(rover), { controller: 'limp' });
    const boxAt = async (seed: number) =>
      (await runner.run(seed)).case.world.objects.find((o) => o.id === 'box')!.position;
    const goalAt = async (seed: number) =>
      (await runner.run(seed)).case.world.objects.find((o) => o.id === 'goal')!.position;

    expect(await boxAt(3)).toEqual(await boxAt(3));
    expect(await boxAt(3)).not.toEqual(await boxAt(4));
    expect(await goalAt(3)).toEqual(await goalAt(4));
  });

  const templatesFor = (robot: FixtureRobot) => caseTemplates(buildRig(robot.joints, robot.parts), robot.parts);
  const limpRuns = ['arm-3dof', 'rover-diff'].flatMap((robot) =>
    templatesFor(fixture(robot))
      .filter((t) => !t.refusal)
      .map((t) => ({ robot, template: t.id })),
  );

  it('a limp robot is tried on every template', () => {
    const every = templatesFor(fixture('rover-diff')).map((t) => t.id);

    expect(new Set(limpRuns.map((r) => r.template))).toEqual(new Set(every));
  });

  it.each(limpRuns)('a limp $robot gets 0 of 20 on $template', async ({ robot, template: id }) => {
    const mj = await loadMujoco();
    const r = fixture(robot);
    const runs = await runCaseTimes(mj, template(r, id), caseRobot(r), { controller: 'limp' });

    expect(runs.runs).toBe(CASE_RUNS);
    expect(runs.passes).toBe(0);
    expect(runs.commonFailure).toBe('missed');
  });

  it('the fixture rover reaches the flag at least 18 of 20 times with randomization on', async () => {
    const mj = await loadMujoco();
    const rover = fixture('rover-diff');
    const runs = await runCaseTimes(mj, template(rover, 'reach-the-flag'), caseRobot(rover));

    expect(runs.passes).toBeGreaterThanOrEqual(18);
    expect(caseRow({ id: 'reach-the-flag', name: 'Reach the Flag' }, runs)).toMatchObject({ status: 'pass' });
  });

  it('the weak quadruped fails Walk Without Falling, mostly by falling', async () => {
    const mj = await loadMujoco();
    const quad = fixture('must-fail-weak-quad');
    const made = buildCase(
      { goal: 'walk', world: 'floor' },
      builderRobot(buildRig(quad.joints, quad.parts), quad.parts),
    );

    if (!made.ok) throw new Error(made.problem);

    const runs = await runCaseTimes(mj, made.kase, caseRobot(quad));
    const row = caseRow(made.kase, runs);

    expect(runs.passes).toBeLessThan(10);
    expect(row.status).toBe('fail');
    expect(row.items?.[0]?.text).toBe('Fell');
  }, 60000);

  it('a robot that doesn’t fit gets a failing row that says why', async () => {
    const mj = await loadMujoco();
    const arm = fixture('arm-3dof');
    const flag = template(fixture('rover-diff'), 'reach-the-flag');
    const runs = await runCaseTimes(mj, flag, caseRobot(arm));
    const row = caseRow(flag, runs);
    const [finding] = caseFindings([row]);

    expect(runs.refusal).toMatch(/wheels/);
    expect(row).toMatchObject({ status: 'fail', detail: '', caseId: 'reach-the-flag' });
    expect(finding).toMatchObject({ level: 'note', check: 'Reach the Flag', text: runs.refusal });
  });

  describe('seeded fault: cutting a rover’s wheel motors to 30% turns its row from pass to fail', () => {
    const rover = withWheelEffort(fixture('rover-diff'), SMALL_GEAR_MOTOR_NM);
    const flag = template(rover, 'reach-the-flag');

    it.each([
      { motors: 'full', robot: rover, status: 'pass' },
      { motors: '30%', robot: withWheelEffort(rover, SMALL_GEAR_MOTOR_NM * 0.3), status: 'fail' },
    ])('$motors wheel motors read $status', async ({ robot, status }) => {
      const mj = await loadMujoco();

      expect(caseRow(flag, await runCaseTimes(mj, flag, caseRobot(robot))).status).toBe(status);
    });
  });
});

describe('summarizing runs', () => {
  const run = (passed: boolean, margin: number, failed: string[] = []) => ({ passed, margin, failed });

  it('counts passes across batches, takes the median margin and the most common failure', () => {
    const runs = summarizeRuns([
      { outcomes: [run(true, 0.4), run(false, -0.2, ['fell']), run(false, -0.6)] },
      { outcomes: [run(false, -0.1, ['fell']), run(true, 0.8)] },
    ]);

    expect(runs).toEqual({ runs: 5, passes: 2, medianMargin: -0.1, commonFailure: 'fell', refusal: null });
  });

  it('reads a refusal from any batch', () => {
    expect(summarizeRuns([{ refusal: 'No wheels.' }]).refusal).toBe('No wheels.');
  });
});
