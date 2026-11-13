import type { MainModule } from '@mujoco/mujoco';
import { fixtureMeasures, fixtureTriangles, type FixtureRobot } from '../sim/fixtures/parts';
import { buildRig } from '../utils/kinematics';
import { runCase as runCaseOn, type CaseRobot, type RunOptions } from './runCase';
import { parseCase as parseCaseFile, type Case } from './schema';
import { touchTheDotsCase } from './touchTheDots';

export const parseCase = parseCaseFile;

export const caseRobot = (robot: FixtureRobot): CaseRobot => ({
  id: robot.id,
  parts: robot.parts,
  joints: robot.joints,
  measures: fixtureMeasures(robot.parts),
  partTriangles: fixtureTriangles(robot.parts),
});

export function touchTheDots(robot: FixtureRobot): Case {
  return touchTheDotsCase(buildRig(robot.joints, robot.parts), robot.parts);
}

type FixtureRun = Omit<RunOptions, 'partners'> & { partners?: FixtureRobot[] };

export function runCase(mj: MainModule, kase: Case, robot: FixtureRobot, options: FixtureRun) {
  return runCaseOn(mj, parseCaseFile(kase), caseRobot(robot), {
    ...options,
    partners: options.partners?.map(caseRobot),
  });
}
