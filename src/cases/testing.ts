import type { MainModule } from '@mujoco/mujoco';
import { fixtureMeasures, fixtureTriangles, type FixtureRobot } from '../sim/fixtures/parts';
import { buildRig } from '../utils/kinematics';
import { presetCase as builtPreset, type PresetId } from './caseBuilder';
import { runCase as runCaseOn, type CaseRobot, type RunOptions } from './runCase';
import { parseCase as parseCaseFile, type Case } from './schema';

export const parseCase = parseCaseFile;

export const caseRobot = (robot: FixtureRobot): CaseRobot => ({
  id: robot.id,
  parts: robot.parts,
  joints: robot.joints,
  measures: fixtureMeasures(robot.parts),
  partTriangles: fixtureTriangles(robot.parts),
});

export const presetCase = (robot: FixtureRobot, id: PresetId): Case =>
  builtPreset(id, buildRig(robot.joints, robot.parts), robot.parts);

export const touchTheDots = (robot: FixtureRobot): Case => presetCase(robot, 'touch-the-dots');

type FixtureRun = Omit<RunOptions, 'partners'> & { partners?: FixtureRobot[] };

export function runCase(mj: MainModule, kase: Case, robot: FixtureRobot, options: FixtureRun) {
  return runCaseOn(mj, parseCaseFile(kase), caseRobot(robot), {
    ...options,
    partners: options.partners?.map(caseRobot),
  });
}
