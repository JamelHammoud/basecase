import type { MainModule } from '@mujoco/mujoco';
import { builderRobot, buildCase, CASE_PRESETS, goalsFor, presetsFor, worldsFor } from '../../src/cases/caseBuilder';
import type { Case } from '../../src/cases/schema';
import { runCase } from '../../src/cases/testing';
import { box, joint, type FixtureRobot, type P3 } from '../../src/sim/fixtures/parts';
import { fixtureRobots } from '../../src/sim/fixtures/robots';
import { buildRig } from '../../src/utils/kinematics';
import { between, freshSeed, pick, seededRng, type Rng } from '../zoo/rng';

export const PLAY_ROBOTS = Object.freeze([
  'arm-3dof',
  'arm-6dof',
  'rover-diff',
  'rover-four',
  'hexapod',
  'quad-servo',
  'quad-big',
]);

export const PLAY_MINIMUMS: Readonly<Record<string, { examples: number; built: number }>> = Object.freeze({
  'arm-3dof': { examples: 1, built: 2 },
  'arm-6dof': { examples: 1, built: 2 },
  'rover-diff': { examples: 1, built: 9 },
  'rover-four': { examples: 1, built: 9 },
  hexapod: { examples: 1, built: 12 },
  'quad-servo': { examples: 1, built: 12 },
  'quad-big': { examples: 1, built: 12 },
});

export const GALLERY_MINIMUM = 3;

const X: P3 = [1, 0, 0];
const Y: P3 = [0, 1, 0];
const Z: P3 = [0, 0, 1];

const GATE_ARM_AXES: ReadonlyArray<readonly P3[]> = [[Y], [X], [X], [Y, X], [X, Z]];

export const GATE_ARM_LINK_MM = Object.freeze({ min: 50, max: 75 });
export const GATE_ARM_SEED = process.env.GATE_ARM_SEED ?? freshSeed();

export interface GateArmShape {
  axes: P3[];
  linksMm: number[];
}

const flip = (rng: Rng, axis: P3): P3 => (rng() < 0.5 ? axis : [-axis[0], -axis[1], -axis[2]]);

export function gateArmShape(seed = GATE_ARM_SEED): GateArmShape {
  const rng = seededRng(seed, 'gate-arm');

  return {
    axes: GATE_ARM_AXES.map((choices) => flip(rng, pick(rng, choices))),
    linksMm: GATE_ARM_AXES.map(() => Math.round(between(rng, GATE_ARM_LINK_MM.min, GATE_ARM_LINK_MM.max))),
  };
}

export function gateArm(shape = gateArmShape()): FixtureRobot {
  const parts = [box('plinth', [0, 20, 0], [90, 40, 90], 450)];
  const joints = [];
  let previous = 'plinth';
  let parentJoint: string | undefined;
  let y = 40;

  for (const [i, axis] of shape.axes.entries()) {
    const name = `seg${i}`;
    const link = shape.linksMm[i];

    parts.push(box(name, [0, y + link / 2, 0], [22, link, 22], 55));
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
    y += link;
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

export interface OfferedCases {
  cases: NamedCase[];
  problems: string[];
}

function minimumProblems(id: string, examples: number, built: number): string[] {
  const least = PLAY_MINIMUMS[id];

  if (!least) return [];

  return [
    ...(examples < least.examples ? [`${examples} fitting examples, the gate pins at least ${least.examples}`] : []),
    ...(built < least.built ? [`${built} New Case goals and worlds, the gate pins at least ${least.built}`] : []),
  ];
}

export function casesFor(robot: FixtureRobot): OfferedCases {
  const rig = buildRig(robot.joints, robot.parts);
  const builder = builderRobot(rig, robot.parts);
  const problems: string[] = [];
  const presets = presetsFor(builder).flatMap((id) => {
    const made = buildCase(CASE_PRESETS[id], builder);

    if (made.ok) return [{ name: id, kase: made.kase }];

    problems.push(`${id} fits but does not build: ${made.problem}`);

    return [];
  });
  const built = goalsFor(builder).flatMap((goal) =>
    worldsFor(goal.kind).flatMap((world) => {
      const made = buildCase({ goal: goal.kind, world: world.kind }, builder);

      if (made.ok) return [{ name: `${goal.kind} in ${world.kind}`, kase: made.kase }];

      problems.push(`${goal.kind} in ${world.kind} is offered but does not build: ${made.problem}`);

      return [];
    }),
  );

  problems.push(...minimumProblems(robot.id, presets.length, built.length));

  return { cases: [...presets, ...built], problems };
}

export const roundTrip = (kase: Case): Case => JSON.parse(JSON.stringify(kase)) as Case;
