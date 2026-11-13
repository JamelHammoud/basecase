import { describe, expect, it } from 'vitest';
import { DEFAULT_PROJECT, type RobotJoint, type ScenePart } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { fixtureMeasures, fixtureTriangles, box, type FixtureRobot } from './fixtures/parts';
import { fixtureRobots } from './fixtures/robots';
import { jointModel } from './jointModel';
import { buildMjcf } from './mjcf';

const servoPart = (id: string, at: [number, number, number], componentId: string): ScenePart => ({
  ...box(id, at, [24, 32, 24], 50),
  kind: 'component',
  componentId,
});

function withServos(robot: FixtureRobot): FixtureRobot {
  const [first, second] = robot.joints;
  const servos = [servoPart(`${robot.id}-xl330`, first.origin, 'dynamixel-xl330-m288')];
  const assign = (j: RobotJoint, id: string): RobotJoint => ({ ...j, parent: [...j.parent, id], actuators: [id] });
  const joints = robot.joints.map((j) => (j === first ? assign(j, servos[0].id) : j));

  if (second) {
    servos.push(servoPart(`${robot.id}-mg996r`, second.origin, 'towerpro-mg996r'));
    joints[1] = assign(second, servos[1].id);
  }

  return { ...robot, id: `${robot.id}-servos`, parts: [...robot.parts, ...servos], joints };
}

const unpublished = (robot: FixtureRobot): FixtureRobot => ({
  ...robot,
  id: `${robot.id}-estimated`,
  joints: robot.joints.map(({ effortNm: _effort, ...j }) => j),
});

function simJoints(robot: FixtureRobot) {
  const rig = buildRig(robot.joints, robot.parts);
  const model = buildMjcf({
    parts: robot.parts,
    rig,
    project: { ...DEFAULT_PROJECT, joints: robot.joints },
    measures: fixtureMeasures(robot.parts),
    partTriangles: fixtureTriangles(robot.parts),
  });
  const byId = new Map(robot.parts.map((p) => [p.id, p]));

  return model.joints.map((sj) => ({
    sim: { effortSource: sj.effortSource, dynamics: sj.dynamics },
    check: jointModel(rig.byId.get(sj.id)!, byId, rig),
  }));
}

describe('jointModel', () => {
  const robots = fixtureRobots().flatMap((r) => [r, withServos(r), unpublished(r), withServos(unpublished(r))]);

  it.each(robots.map((r) => [r.id, r] as const))('says what the simulator writes for %s', (_id, robot) => {
    for (const { sim, check } of simJoints(robot)) expect(check).toEqual(sim);
  });

  it('tells a measured servo from an estimated one', () => {
    const [arm] = fixtureRobots().filter((r) => r.id === 'arm-3dof');
    const models = simJoints(withServos(unpublished(arm))).map((m) => m.check);

    expect(models.slice(0, 3)).toEqual([
      { effortSource: 'servo', dynamics: 'measured' },
      { effortSource: 'servo', dynamics: 'estimated' },
      { effortSource: 'estimate', dynamics: 'estimated' },
    ]);
  });
});
