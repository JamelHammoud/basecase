import { fixtureRobots } from '../sim/fixtures/robots';
import { closedLinkage } from '../sim/fixtures/closedLinkages';
import { continuationScenario } from '../sim/fixtures/continuationScenarios';
import { buildRig } from '../utils/kinematics';
import { buildCase, builderRobot } from './caseBuilder';
import type { GoalKind, GoalValues } from './caseGoals';
import type { Case } from './schema';
import { caseRobot } from './testing';
import { workbenchTask } from './workbench/tasks.fixtures';

export const EVALUATION_WORKFLOWS = [
  'rover navigation',
  'fixed-arm pickup',
  'quadruped standing',
  'hexapod traversal',
  'biped balance',
  'pan-tilt observation',
  'gripper transfer',
  'conveyor handling',
  'passive-drawer manipulation',
  'closed-linkage motion',
] as const;

function built(id: string, goal: GoalKind, values?: Partial<GoalValues>) {
  const robot = fixtureRobots().find((value) => value.id === id)!;
  const made = buildCase(
    { goal, world: 'floor', values },
    builderRobot(buildRig(robot.joints, robot.parts), robot.parts),
  );

  if (!made.ok) throw new Error(made.problem);

  return { robot: caseRobot(robot), kase: made.kase };
}

function standing(id: string) {
  const fixture = built(id, 'walk');
  const contract = fixture.kase.task.contract;
  const upright = contract.failures.find((failure) => failure.label === 'fell');

  if (!upright || !('eventually' in upright.formula)) throw new Error('Standing fixture requires the fall contract.');

  const kase: Case = {
    ...fixture.kase,
    reference: { timeline: [] },
    task: {
      ...fixture.kase.task,
      seconds: 2,
      contract: {
        version: 1,
        success: { always: { window: 'whole', state: { not: upright.formula.eventually.state } } },
        failures: contract.failures,
      },
    },
  };

  return { ...fixture, kase };
}

export function evaluationWorkflow(name: (typeof EVALUATION_WORKFLOWS)[number]) {
  if (name === 'rover navigation') return built('rover-diff', 'reach');

  if (name === 'fixed-arm pickup') return built('arm-6dof', 'pick');

  if (name === 'quadruped standing') return standing('quad-servo');

  if (name === 'hexapod traversal') return built('hexapod', 'walk', { seconds: 2, distanceMm: 100 });

  if (name === 'biped balance') return standing('biped-servo');

  if (name === 'pan-tilt observation') {
    const fixture = continuationScenario('pan-tilt target following');

    return { ...fixture, robot: caseRobot(fixture.robot) };
  }

  if (name === 'gripper transfer') {
    const fixture = continuationScenario('cylinder transfer');

    return { ...fixture, robot: caseRobot(fixture.robot) };
  }

  if (name === 'conveyor handling') {
    const fixture = workbenchTask(8);

    return { robot: fixture.robot, kase: fixture.source };
  }

  if (name === 'passive-drawer manipulation') return built('arm-6dof', 'drawer');

  const fixture = closedLinkage();

  return {
    robot: { id: name, ...fixture.input, joints: fixture.input.project.joints },
    kase: built('arm-3dof', 'touch').kase,
  };
}
