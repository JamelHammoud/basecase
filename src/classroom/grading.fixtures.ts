import { fallGuard } from '../cases/caseGoals';
import { CaseCheckPool } from '../cases/caseChecksClient';
import { NodePipelineWorker } from './nodeWorkers.fixtures';
import { buildCase, builderRobot, type CaseSpec } from '../cases/caseBuilder';
import { caseSlots, parseCase, type Case } from '../cases/schema';
import { galleryBundleOf } from '../gallery/buildBundle';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildRig } from '../utils/kinematics';
import { createStudySession } from '../study/client';
import { classroomFileClient } from './fileClient';
import type { GradingResources } from './grading';
import { assignmentOf, submissionOf } from './envelope';

export function pipelineResources(workers: NodePipelineWorker[]): GradingResources {
  return {
    study: createStudySession(),
    files: classroomFileClient(),
    cases: new CaseCheckPool(() => {
      const worker = new NodePipelineWorker('cases');

      workers.push(worker);

      return worker;
    }),
  };
}

const SPECS: Array<{ title: string; robot: string; spec: CaseSpec; budget: number }> = [
  { title: 'Carry a cup across a table', robot: 'arm-6dof', spec: { goal: 'pick', world: 'floor' }, budget: 60 },
  { title: 'Reach a rover flag', robot: 'rover-diff', spec: { goal: 'reach', world: 'floor' }, budget: 60 },
  { title: 'Navigate a corridor', robot: 'rover-diff', spec: { goal: 'reach', world: 'corridor' }, budget: 60 },
  { title: 'Push a block', robot: 'rover-four', spec: { goal: 'push', world: 'block' }, budget: 60 },
  { title: 'Touch an arm target', robot: 'arm-3dof', spec: { goal: 'touch', world: 'floor' }, budget: 60 },
  { title: 'Pick up a block', robot: 'arm-6dof', spec: { goal: 'pick', world: 'floor' }, budget: 60 },
  {
    title: 'Compare grippers',
    robot: 'arm-6dof',
    spec: { goal: 'pick', world: 'floor', values: { spacingMm: 50 } },
    budget: 60,
  },
  { title: 'Support an arm payload', robot: 'arm-3dof', spec: { goal: 'touch', world: 'floor' }, budget: 60 },
  {
    title: 'Stand a quadruped',
    robot: 'quad-servo',
    spec: { goal: 'walk', world: 'floor', values: { seconds: 2 } },
    budget: 100,
  },
  {
    title: 'Improve walking within an actuator budget',
    robot: 'quad-servo',
    spec: { goal: 'walk', world: 'floor', values: { seconds: 4, distanceMm: 300 } },
    budget: 100,
  },
];

function carriedCup(kase: Case): Case {
  const raise = 80;
  const world = kase.world.objects.map((object) => ({
    ...object,
    kind: object.id === 'block' ? ('cylinder' as const) : object.kind,
    position: [object.position[0], object.position[1] + raise, object.position[2]],
  }));
  const table = {
    ...world[0],
    id: 'table',
    kind: 'box' as const,
    behavior: 'static' as const,
    position: [0, raise / 2, 250],
    size: [350, raise, 400],
    massG: 0,
  };

  return parseCase({
    ...kase,
    world: { objects: [...world, table] },
    reference: {
      timeline: kase.reference.timeline.map((command) => ({
        ...command,
        target: command.target?.map((n, axis) => n + (axis === 1 ? raise : 0)),
      })),
    },
  });
}

function standing(kase: Case, robot: ReturnType<typeof builderRobot>): Case {
  const formula = fallGuard(robot).failure.formula;

  if (!('eventually' in formula)) throw new Error('Standing needs the existing fall predicate');

  return parseCase({
    ...kase,
    reference: { timeline: [] },
    task: {
      ...kase.task,
      contract: {
        version: 1,
        success: { always: { window: 'whole', state: { not: formula.eventually.state } } },
        failures: [fallGuard(robot).failure],
      },
    },
  });
}

export const classroomAssignments = SPECS.map((item, index) => ({ ...item, index }));

export async function generatedClassroom(index: number) {
  const item = SPECS[index];
  let robot = fixtureRobots().find((r) => r.id === item.robot)!;

  if (index === 7)
    robot = { ...robot, parts: robot.parts.map((part) => (part.id === 'link2' ? { ...part, massG: 300 } : part)) };

  const built = buildCase(item.spec, builderRobot(buildRig(robot.joints, robot.parts), robot.parts));

  if (!built.ok) throw new Error(built.problem);

  let kase = built.kase;

  if (index === 0) kase = carriedCup(kase);

  if (index === 8) kase = standing(kase, builderRobot(buildRig(robot.joints, robot.parts), robot.parts));

  const bundle = galleryBundleOf({ slug: `class-${index}`, title: item.title, robotName: item.robot, ...robot, kase });
  const assignment = await assignmentOf(bundle, item.budget, `assignment-${index}`);
  const valid = await submissionOf(assignment, bundle, 'Student');
  const broken = {
    ...bundle,
    robot: { ...bundle.robot, joints: bundle.robot.joints.map((joint) => ({ ...joint, effortNm: 0.0001 })) },
  };
  const failing = await submissionOf(assignment, broken, 'Student');

  return { assignment, valid, failing, slots: caseSlots(kase) };
}
