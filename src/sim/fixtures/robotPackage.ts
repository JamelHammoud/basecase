import { DEFAULT_PROJECT, type ProjectSettings } from '../../types/robotics';
import { buildRig } from '../../utils/kinematics';
import { buildMjcf } from '../mjcf';
import type { RobotPackageJob } from '../robotPackage/buildRobotPackage';
import type { PackagedPolicy } from '../robotPackage/policyFiles';
import { fixtureMeasures, fixtureTriangles, type FixtureRobot } from './parts';

type PackagedRobot = Pick<FixtureRobot, 'id' | 'parts' | 'joints'>;

export function fixturePackageJob(robot: PackagedRobot, policies: PackagedPolicy[] = []) {
  const project: ProjectSettings = { ...DEFAULT_PROJECT, joints: robot.joints };
  const measures = fixtureMeasures(robot.parts);
  const triangles = fixtureTriangles(robot.parts);
  const model = buildMjcf({
    parts: robot.parts,
    rig: buildRig(robot.joints, robot.parts),
    project,
    measures,
    partTriangles: triangles,
  });
  const job: RobotPackageJob = {
    name: `${robot.id}-robot`,
    robot: robot.id,
    model,
    parts: robot.parts,
    project,
    measures,
    triangles: Object.fromEntries(robot.parts.map((p) => [p.id, triangles(p.id)!])),
    policies,
  };

  return { job, project, measures };
}
