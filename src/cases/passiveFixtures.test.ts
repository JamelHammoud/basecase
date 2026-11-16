import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildRig } from '../utils/kinematics';
import { buildCase, builderRobot } from './caseBuilder';
import type { GoalKind } from './caseGoals';
import { parseCase } from './schema';
import { runCase } from './testing';
import { scoreTry, trySignals } from './tries';
import { robotFacts } from './robotFit';
import { decodeRecording, encodeRecording } from './recordingFile';

const arm = () => fixtureRobots().find((robot) => robot.id === 'arm-6dof')!;

function fixtureCase(goal: GoalKind) {
  const robot = arm();
  const built = buildCase(
    { goal, world: 'floor', values: { fixtureMassG: 35 } },
    builderRobot(buildRig(robot.joints, robot.parts), robot.parts),
  );

  if (!built.ok) throw new Error(built.problem);

  return built.kase;
}

describe('passive Case fixtures', () => {
  for (const goal of ['lid', 'drawer'] as const) {
    it(`${goal} moves through contact, records its travel and fails negative controls`, async () => {
      const mj = await loadMujoco();
      const robot = arm();
      const kase = fixtureCase(goal);
      const result = await runCase(mj, kase, robot, { controller: 'reference', record: true });
      const rig = buildRig(robot.joints, robot.parts);
      const scoring = {
        kase: parseCase(JSON.parse(JSON.stringify(result.case))),
        model: result.model,
        recording: decodeRecording(encodeRecording(result.recording!))!,
        rig,
        effector: robotFacts(rig, robot.parts).endEffector,
      };

      expect(
        result.passed,
        JSON.stringify({
          travel: result.trace.signals['fixture-travel']?.filter((_, i) => i % 50 === 0),
          contact: result.trace.signals['handle-contact']?.filter((_, i) => i % 50 === 0),
        }),
      ).toBe(true);
      expect(result.model.joints).toHaveLength(robot.joints.length);
      expect(result.recording!.nu).toBe(robot.joints.length);
      expect(result.recording!.nq).toBe(result.recording!.nu + 1);
      expect(result.case.world.objects.find((object) => object.id === 'fixture')?.massG).toBe(35);

      const replayTravel = trySignals(scoring).signals['fixture-travel'];

      expect(Math.max(...replayTravel)).toBeGreaterThan(20);
      expect(Math.abs(replayTravel[0])).toBeLessThan(2);
      expect(Math.max(...replayTravel)).toBeCloseTo(Math.max(...result.trace.signals['fixture-travel']), 3);
      expect((await scoreTry(scoring)).passed).toBe(true);
      expect((await runCase(mj, kase, robot, { controller: 'limp' })).passed).toBe(false);

      const locked = structuredClone(kase);
      const fixture = locked.world.objects.find((object) => object.joint)!;

      fixture.joint!.locked = true;
      expect((await runCase(mj, locked, robot, { controller: 'reference' })).passed).toBe(false);
    });
  }

  it('refuses broken topology and unbounded physics before compilation', () => {
    const kase = fixtureCase('lid');
    const fixture = kase.world.objects.find((object) => object.joint)!;

    for (const change of [
      { parent: fixture.id },
      { parent: 'missing' },
      { joint: { ...fixture.joint, axis: [0, 0, 0] } },
      { joint: { ...fixture.joint, damping: -1 } },
      { joint: { ...fixture.joint, range: [50, -50] } },
      { massG: Number.NaN },
      { movable: true },
    ]) {
      const broken = structuredClone(kase);

      Object.assign(
        broken.world.objects.find((object) => object.id === fixture.id)!,
        change,
      );
      expect(() => parseCase(broken)).toThrow();
    }
  });
});
