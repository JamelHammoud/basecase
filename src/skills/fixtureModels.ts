import { fixtureMeasures, fixtureTriangles, type FixtureRobot } from '../sim/fixtures/parts';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildMjcf } from '../sim/mjcf';
import type { SimModel } from '../sim/mjcfTypes';
import { DEFAULT_PROJECT, type ScenePart } from '../types/robotics';
import { buildRig } from '../utils/kinematics';

export function fixtureRobot(id: string): FixtureRobot {
  const robot = fixtureRobots().find((r) => r.id === id);

  if (!robot) throw new Error(`No fixture robot ${id}.`);

  return robot;
}

export function modelOf(robot: Pick<FixtureRobot, 'parts' | 'joints'>, timestep?: number): SimModel {
  return buildMjcf({
    parts: robot.parts,
    rig: buildRig(robot.joints, robot.parts),
    project: { ...DEFAULT_PROJECT, joints: robot.joints },
    measures: fixtureMeasures(robot.parts),
    partTriangles: fixtureTriangles(robot.parts),
    timestep,
  });
}

export const fixtureModel = (id: string, timestep?: number) => modelOf(fixtureRobot(id), timestep);

export function editParts(robot: FixtureRobot, edit: (p: ScenePart) => ScenePart): FixtureRobot {
  return { ...robot, parts: robot.parts.map(edit) };
}
