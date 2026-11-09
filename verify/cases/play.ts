import type { MainModule } from '@mujoco/mujoco';
import { builderRobot, buildCase, goalsFor, worldsFor } from '../../src/cases/caseBuilder';
import type { Case } from '../../src/cases/schema';
import { caseTemplates } from '../../src/cases/templates';
import { runCase } from '../../src/cases/testing';
import { box, joint, type FixtureRobot, type P3 } from '../../src/sim/fixtures/parts';
import { fixtureRobots } from '../../src/sim/fixtures/robots';
import { buildRig } from '../../src/utils/kinematics';

export const PLAY_ROBOTS = Object.freeze([
  'arm-3dof',
  'arm-6dof',
  'rover-diff',
  'rover-four',
  'hexapod',
  'quad-servo',
  'quad-big',
]);

const X: P3 = [1, 0, 0];
const Y: P3 = [0, 1, 0];

const GATE_ARM_AXES: P3[] = [Y, X, X, Y, X];
const GATE_ARM_LINK_MM = 60;

export function gateArm(): FixtureRobot {
  const parts = [box('plinth', [0, 20, 0], [90, 40, 90], 450)];
  const joints = [];
  let previous = 'plinth';
  let parentJoint: string | undefined;

  for (const [i, axis] of GATE_ARM_AXES.entries()) {
    const name = `seg${i}`;
    const y = 40 + GATE_ARM_LINK_MM * i;

    parts.push(box(name, [0, y + GATE_ARM_LINK_MM / 2, 0], [22, GATE_ARM_LINK_MM, 22], 55));
    joints.push(
      joint({
        id: `j${i}`,
        link: [previous, name],
        origin: [0, y, 0],
        axis,
        effortNm: 3.5,
        parentJoint,
        limb: 'arm',
      }),
    );
    previous = name;
    parentJoint = `j${i}`;
  }

  return { id: 'gate-arm-5dof', parts, joints, expect: { morphology: 'fixed', stand: 'n/a', walk: 'n/a' } };
}

export function playRobot(id: string): FixtureRobot {
  if (id === 'gate-arm-5dof') return gateArm();

  const robot = fixtureRobots().find((r) => r.id === id);

  if (!robot) throw new Error(`No fixture robot ${id}`);

  return robot;
}

export interface PlayRun {
  passed: boolean;
  margin: number;
  refusal?: string;
}

export function playProblems(limp: PlayRun, reference: PlayRun, again: PlayRun): string[] {
  const problems: string[] = [];

  if (limp.refusal || reference.refusal) return [`refused: ${limp.refusal ?? reference.refusal}`];

  if (Number.isNaN(limp.margin) || limp.margin >= 0 || limp.passed)
    problems.push(`limp margin ${limp.margin.toFixed(4)} is not negative`);

  if (Number.isNaN(reference.margin) || reference.margin <= 0 || !reference.passed)
    problems.push(`reference margin ${reference.margin.toFixed(4)} is not positive`);

  if (again.margin !== reference.margin) problems.push('the reference run does not repeat exactly');

  return problems;
}

export async function judgePlay(mj: MainModule, kase: Case, robot: FixtureRobot): Promise<string[]> {
  const limp = await runCase(mj, kase, robot, { controller: 'limp' });
  const reference = await runCase(mj, kase, robot, { controller: 'reference' });
  const again = await runCase(mj, kase, robot, { controller: 'reference' });

  return playProblems(limp, reference, again);
}

export interface NamedCase {
  name: string;
  kase: Case;
}

export function casesFor(robot: FixtureRobot): NamedCase[] {
  const rig = buildRig(robot.joints, robot.parts);
  const templates = caseTemplates(rig, robot.parts)
    .filter((t) => !t.refusal)
    .map((t) => ({ name: t.name, kase: t.build() }));
  const builder = builderRobot(rig, robot.parts);
  const built = goalsFor(builder).flatMap((goal) =>
    worldsFor(goal.kind).flatMap((world) => {
      const made = buildCase({ goal: goal.kind, world: world.kind }, builder);

      return made.ok ? [{ name: `${goal.kind} in ${world.kind}`, kase: made.kase }] : [];
    }),
  );

  return [...templates, ...built];
}

export const roundTrip = (kase: Case): Case => JSON.parse(JSON.stringify(kase)) as Case;
