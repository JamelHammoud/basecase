import { fixtureMeasures, fixtureTriangles, type FixtureRobot } from '../../src/sim/fixtures/parts';
import { fixtureRobots } from '../../src/sim/fixtures/robots';
import { buildMjcf, type SimModel } from '../../src/sim/mjcf';
import { DEFAULT_PROJECT, type RobotJoint } from '../../src/types/robotics';
import { buildRig } from '../../src/utils/kinematics';
import { CATALOG_SERVOS, servoPart } from './pendulum';

const LIFT_MM = 1000;
const REST_SHARE = 0.25;
const UNLIMITED_REST_DEG = 20;
const SMALL_SERVO_NM = 1;

const lifted = (p: [number, number, number]): [number, number, number] => [p[0], p[1] + LIFT_MM, p[2]];

function equip(robot: FixtureRobot): FixtureRobot {
  const servos = robot.joints.map((j) =>
    servoPart(`servo_${j.id}`, (j.effortNm ?? 0) < SMALL_SERVO_NM ? CATALOG_SERVOS.xl330 : CATALOG_SERVOS.sts3215, [
      j.origin[0],
      j.origin[1] + LIFT_MM,
      j.origin[2] + 40,
    ]),
  );
  const joints: RobotJoint[] = robot.joints.map((j) => ({
    ...j,
    origin: lifted(j.origin),
    parent: [...j.parent, `servo_${j.id}`],
    actuators: [`servo_${j.id}`],
    effortNm: undefined,
  }));

  return {
    ...robot,
    parts: [...robot.parts.map((p) => ({ ...p, position: lifted(p.position) })), ...servos],
    joints,
  };
}

const restValue = (j: RobotJoint) => (j.range ? Math.max(...j.range) * REST_SHARE : UNLIMITED_REST_DEG);

export interface ServoRobot {
  id: string;
  model: SimModel;
}

export function servoRobots(): ServoRobot[] {
  return fixtureRobots().map((fixture) => {
    const robot = equip(fixture);
    const rig = buildRig(robot.joints, robot.parts);

    return {
      id: robot.id,
      model: buildMjcf({
        parts: robot.parts,
        rig,
        project: { ...DEFAULT_PROJECT, joints: robot.joints },
        pose: { values: Object.fromEntries(robot.joints.map((j) => [j.id, restValue(j)])) },
        measures: fixtureMeasures(robot.parts),
        partTriangles: fixtureTriangles(robot.parts),
        fixedBase: Object.fromEntries(rig.robots.map((r) => [r.key, true])),
      }),
    };
  });
}

export const weightless = (model: SimModel): SimModel => ({
  ...model,
  xml: model.xml.replace('<option ', '<option gravity="0 0 0" '),
});
