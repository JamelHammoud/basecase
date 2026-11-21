import * as THREE from 'three';
import loadMujoco from '@mujoco/mujoco';
import { expect, it } from 'vitest';
import { placedRobot, placementOf } from '../cases/slots';
import { buildRig, forwardKinematics, solveIK, type V3 } from '../utils/kinematics';
import { tendonMechanism } from './fixtures/tendonMechanisms';
import { buildMjcf } from './mjcf';
import { SimEngine } from './engine';
import { poseSetup } from './drivePose';
import { armSetup } from './driveSetup';
import { assertTendonController } from './tendonController';

function mixedRobots() {
  const { input } = tendonMechanism();
  const direct = placedRobot(
    { parts: input.parts, joints: input.project.joints.map((joint) => ({ ...joint, tendon: undefined })) },
    placementOf({ id: 'direct', pose: { position: [500, 400, 0], yawDeg: 0 } }, [0, 400, 0]),
  );
  const parts = [...input.parts, ...direct.parts];
  const project = { ...input.project, joints: [...input.project.joints, ...direct.joints] };
  const rig = buildRig(project.joints, parts);
  const model = buildMjcf({ ...input, parts, project, rig });
  const motor = rig.byId.get('direct.motor_0')!;
  const point: V3 = [motor.origin[0] + 30, motor.origin[1] + 10, motor.origin[2]];
  const posed = forwardKinematics(rig, { values: { [motor.id]: 20 } });
  const position = new THREE.Vector3(...point).applyMatrix4(posed.joint.get(motor.id)!);
  const target: V3 = [position.x, position.y, position.z];
  const arm = armSetup({
    rig,
    robot: rig.robotOf.get(motor.id)!,
    effector: { part: 'direct.spool_0', point },
    joints: [motor.id],
    anchor: motor.origin,
    reachMm: 100,
  });

  return { rig, model, arm, target };
}

it('solves ordinary arm IK beside a tendon robot while refusing targets on the tendon robot', () => {
  const { rig, arm, target } = mixedRobots();
  const solved = solveIK(rig, {}, [{ partId: arm.part, point: arm.point, target }], { joints: arm.joints });

  expect(solved.maxError).toBeLessThan(0.3);
  expect(solved.values['direct.motor_0']).toBeGreaterThan(10);
  expect(solved.values.motor_0).toBeUndefined();
  expect(() => solveIK(rig, {}, [{ partId: 'link_0', point: [50, 400, 0], target }])).toThrow('Use Simulate');
});

it('runs a mixed arm and tendon pose team without rejecting the independent arm', async () => {
  const { rig, model, arm, target } = mixedRobots();
  const engine = new SimEngine(await loadMujoco(), model);
  const pose = poseSetup(rig, { robot: rig.robotOf.get('motor_0')! });

  try {
    engine.setController({ kind: 'drive', setup: arm });
    engine.setController({
      kind: 'drive',
      setup: {
        kind: 'team',
        members: [
          { slot: 0, setup: pose },
          { slot: 1, setup: arm },
        ],
      },
    });
    engine.command({ slot: 0, v: [0, 0, 0], joints: { motor_0: 20 } });
    engine.command({ slot: 1, v: [0, 0, 0], target });
    engine.step(0.5);

    const angles = Object.fromEntries(model.joints.map((joint, i) => [joint.id, engine.jointAngles()[i]]));

    expect(angles.motor_0).toBeGreaterThan(0.1);
    expect(angles['direct.motor_0']).toBeGreaterThan(0.1);
    expect(angles.output_0).toBeCloseTo(angles.motor_0, 2);
    expect(() => assertTendonController({ kind: 'drive', setup: { ...arm, robot: pose.robot } }, model.joints)).toThrow(
      'Use Simulate',
    );
  } finally {
    engine.dispose();
  }
});
