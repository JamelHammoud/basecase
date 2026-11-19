import { box, fixtureMeasures, fixtureTriangles } from '../sim/fixtures/parts';
import { buildMjcf } from '../sim/mjcf';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { fixtureRobot } from './fixtureModels';

export function dividerInput() {
  const robot = fixtureRobot('arm-3dof');
  const obstacle = { ...box('divider', [0, 210, 0], [80, 20, 30], 1000), behavior: 'static' as const };

  robot.joints[1] = { ...robot.joints[1], range: [-150, 150] };

  return {
    parts: robot.parts,
    rig: buildRig(robot.joints, robot.parts),
    project: { ...DEFAULT_PROJECT, joints: robot.joints },
    measures: fixtureMeasures(robot.parts),
    partTriangles: fixtureTriangles(robot.parts),
    world: [obstacle],
    pose: { values: { arm0: -60, arm1: 0, arm2: 0 } },
  };
}

export const dividerModel = () => buildMjcf(dividerInput());
