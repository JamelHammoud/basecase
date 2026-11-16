import type { MainModule } from '@mujoco/mujoco';
import { buildCase, builderRobot } from '../../cases/caseBuilder';
import { runCase } from '../../cases/testing';
import type { Case } from '../../cases/schema';
import { robotFacts } from '../../cases/robotFit';
import { buildRig } from '../../utils/kinematics';
import { captureContactReplay } from './contactReplay';
import { fixtureRobots } from './robots';
import { PASSIVE_VARIANTS, passiveVariant, type PassiveVariant } from './passiveVariants';
import type { FixtureRobot } from './parts';

export async function capturePassiveFixture(mj: MainModule, authored: Case, arm: FixtureRobot, fault: PassiveVariant) {
  const { kase, robot, controller, passed } = passiveVariant(authored, arm, fault);
  const capture = captureContactReplay(mj);
  const result = await runCase(capture.module, kase, robot, {
    controller,
    record: true,
  });

  const peak = Math.max(...result.trace.signals['fixture-travel'].map(Math.abs));
  const limit = Math.max(...kase.world.objects[0].joint!.range.map(Math.abs));

  if (peak > limit + 2) throw new Error(`${authored.name} ${fault} exceeded its stop by ${peak - limit}.`);

  if (result.passed !== passed) throw new Error(`${authored.name} ${fault} has an unexpected verdict.`);

  return {
    ...capture.finish(`${authored.id}-${fault}`, result.model),
    wasmPassed: result.passed,
    kase: result.case,
    model: result.model,
    parts: robot.parts,
    joints: robot.joints,
    effector: robotFacts(buildRig(robot.joints, robot.parts), robot.parts).endEffector,
  };
}

export async function passiveContactReplays(mj: MainModule) {
  const arm = fixtureRobots().find((robot) => robot.id === 'arm-6dof')!;
  const builder = builderRobot(buildRig(arm.joints, arm.parts), arm.parts);
  const replays = [];

  for (const goal of ['lid', 'drawer'] as const) {
    const built = buildCase({ goal, world: 'floor' }, builder);

    if (!built.ok) throw new Error(built.problem);

    const kase = { ...built.kase, id: goal };

    for (const fault of PASSIVE_VARIANTS) {
      const shorter =
        fault === 'short' ? buildCase({ goal, world: 'floor', values: { fixtureTravel: 30 } }, builder) : null;
      const chosen = shorter?.ok ? { ...shorter.kase, id: goal } : kase;

      replays.push(await capturePassiveFixture(mj, chosen, arm, fault));
    }
  }

  return replays;
}
