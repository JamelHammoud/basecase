import type { Case } from '../cases/schema';
import type { ScenePart } from '../types/robotics';
import type { Rig } from '../utils/kinematics';
import { driveAccess } from '../sim/driveAccess';
import type { SimModel } from '../sim/mjcfTypes';
import { currentDesign, skillFreshness } from '../skills/artifacts';
import { designOf } from '../skills/skillsRuntime';
import { triesEnvironment } from '../skills/triesTraining';
import { isTrainablePolicy } from '../skills/policyCheck';
import type { RoutineSkills } from './routineCheck';
import type { Simulation } from '../sim/useSimulation';
import type { RobotJoint } from '../types/robotics';
import type { caseLogicPlan } from './caseLogicPlan';

export async function caseTeaching(input: {
  model: SimModel;
  kase: Case;
  rig: Rig;
  parts: ScenePart[];
  skills?: RoutineSkills;
}) {
  const { model, kase, rig, parts } = input;
  const access = driveAccess({ model, rig, parts });
  const own = (await input.skills?.own(kase.id)) ?? [];
  const candidates = own.filter((candidate) => candidate.record?.case?.id === kase.id).toReversed();
  const source = candidates.find((candidate) => {
    const { skill } = candidate;

    if (skill.controller.kind !== 'policy' || !isTrainablePolicy(skill.controller.policy)) return false;

    const policy = skill.controller.policy;
    const environment = triesEnvironment(model, kase, policy);

    return (
      !policy.clock &&
      !policy.eyes?.length &&
      !policy.squash &&
      skillFreshness(skill, currentDesign({ design: designOf(model), model, environment })) === 'fresh'
    );
  });

  if (!source || source.skill.controller.kind !== 'policy' || access.kind !== 'ready' || access.setup.kind !== 'arm')
    throw new Error('Train a policy for this Case first.');

  return { controller: source.skill.controller, setup: access.setup, skill: source.hash };
}

export async function startCaseTeaching(input: {
  scene: Parameters<typeof caseTeaching>[0];
  sim: Simulation;
  current: () => boolean;
  logic: Awaited<ReturnType<typeof caseLogicPlan>>;
  joints: RobotJoint[];
}) {
  const source = await caseTeaching(input.scene);

  if (!input.current()) return null;

  const reply = await input.sim.teaching.start({
    ...source,
    input: {
      kase: input.scene.kase,
      plan: input.logic.plan,
      joints: input.joints,
      kit: input.logic.kit,
    },
  });

  if (reply.problem) throw new Error(reply.problem);

  return reply;
}
