import loadMujoco from '@mujoco/mujoco';
import { expect, it } from 'vitest';
import { buildMjcf } from '../sim/mjcf';
import { fixtureMeasures, fixtureTriangles } from '../sim/fixtures/parts';
import { fixtureRobots } from '../sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { ArenaWorld, drawInstance, seededRandom } from './arenaWorld';

it('leaves passive dynamics unchanged by servo draws and still draws powered joints', async () => {
  const robot = fixtureRobots().find((fixture) => fixture.id === 'arm-3dof')!;
  const joints = robot.joints.map((joint, i) =>
    i === 0 ? { ...joint, actuation: 'passive' as const, damping: 0.3 } : joint,
  );
  const model = buildMjcf({
    parts: robot.parts,
    rig: buildRig(joints, robot.parts),
    project: { ...DEFAULT_PROJECT, joints },
    measures: fixtureMeasures(robot.parts),
    partTriangles: fixtureTriangles(robot.parts),
  });
  const mj = await loadMujoco();
  const world = new ArenaWorld(mj, model);
  const instance = drawInstance(seededRandom('00112233445566778899aabbccddeeff'), {
    ranges: {
      friction: [1, 1],
      mass: [1, 1],
      strength: [1, 1],
      latencyMs: [0, 0],
      jointNoiseDeg: 0,
      baseYawDeg: 0,
      baseOffsetMm: 0,
    },
    bodies: model.bodies.length,
    joints: model.joints.length,
  });
  const passive = model.joints.find((joint) => joint.actuator < 0)!;
  const powered = model.joints.find((joint) => joint.actuator >= 0)!;
  const dof =
    world.engine.model.jnt_dofadr[mj.mj_name2id(world.engine.model, mj.mjtObj.mjOBJ_JOINT.value, passive.name)];
  const damping = world.engine.model.dof_damping[dof];
  const gain = world.engine.model.actuator_gainprm[powered.actuator * 10];
  const draw = { kp: 2, damping: 3, armature: 4, frictionloss: 5, forceNm: 6, delayS: 7 };

  try {
    world.prepare({
      instance: { ...instance, servos: { [passive.id]: draw, [powered.id]: draw } },
      controller: { kind: 'hold' },
      start: model.initial,
      robot: model.robots[0].key,
    });
    expect(world.engine.model.dof_damping[dof]).toBe(damping);
    expect(world.engine.model.actuator_gainprm[powered.actuator * 10]).toBe(2 * gain);
  } finally {
    world.dispose();
  }
});
