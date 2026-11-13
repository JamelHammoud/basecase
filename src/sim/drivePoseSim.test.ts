import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { fixtureModel, modelOf } from '../skills/fixtureModels';
import { DEFAULT_PROJECT } from '../types/robotics';
import { humanoid } from '../utils/mocap.fixtures';
import { buildRig } from '../utils/kinematics';
import { fixtureMeasures, fixtureTriangles } from './fixtures/parts';
import type { PoseSetup } from './drivePose';
import { SimEngine } from './engine';
import { buildMjcf, type SimModel } from './mjcf';
import { POLICY_FORMAT, POLICY_VERSION, policyObsSize, type PolicySpec } from './policy';

const D2R = Math.PI / 180;

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

function stillPolicy(model: SimModel, pose: number): PolicySpec {
  const joints = model.joints.filter((j) => j.actuator >= 0 && j.drive === 'position').map((j) => j.id);
  const obs = policyObsSize({ joints });

  return {
    format: POLICY_FORMAT,
    version: POLICY_VERSION,
    task: 'stand',
    robot: model.robots[0].key,
    joints,
    defaultPose: joints.map(() => pose),
    actionScale: 0.25,
    controlDt: 0.02,
    command: [0, 0, 0],
    obsMean: Array.from({ length: obs }, () => 0),
    obsStd: Array.from({ length: obs }, () => 1),
    layers: [
      { in: obs, out: joints.length, w: Array.from({ length: obs * joints.length }, () => 0), b: joints.map(() => 0) },
    ],
    activation: 'elu',
    trainedSteps: 0,
    mujoco: '4.0.0',
    createdAt: '',
  };
}

const ctrlOf = (engine: SimEngine, joint: string) =>
  engine.data.ctrl[engine.sim.joints.find((j) => j.id === joint)?.actuator ?? -1];

const qposOf = (engine: SimEngine, joint: string) =>
  engine.data.qpos[engine.jointAddresses()[engine.sim.joints.findIndex((j) => j.id === joint)]];

function poseSetup(model: SimModel, joints: string[], under?: PoseSetup['under']): PoseSetup {
  return {
    kind: 'pose',
    robot: model.robots[0].key,
    joints: joints.map((id) => ({ id, range: [-90, 90] })),
    start: {},
    under,
  };
}

describe('pose drive over a policy', () => {
  it('drives the pose joints to their targets while the policy drives the rest', () => {
    const model = fixtureModel('quad-servo');
    const policy = stillPolicy(model, 0.2);
    const engine = new SimEngine(mj, model);
    const under = { policy, robot: model.robots[0].key };

    engine.setController({ kind: 'drive', setup: poseSetup(model, ['leg0_swing'], under) });
    engine.command({ v: [0, 0, 0], joints: { leg0_swing: 30 } });
    engine.step(1);

    expect(ctrlOf(engine, 'leg0_swing')).toBeCloseTo(30 * D2R, 6);
    expect(qposOf(engine, 'leg0_swing')).toBeGreaterThan(15 * D2R);

    for (const id of policy.joints.filter((j) => j !== 'leg0_swing')) expect(ctrlOf(engine, id)).toBeCloseTo(0.2, 6);

    engine.dispose();
  });

  it('writes every actuator from the pose and the start without a policy under it', () => {
    const model = fixtureModel('quad-servo');
    const engine = new SimEngine(mj, model);

    engine.setController({ kind: 'drive', setup: poseSetup(model, ['leg0_swing']) });
    engine.command({ v: [0, 0, 0], joints: { leg0_swing: -20 } });
    engine.step(0.5);

    expect(ctrlOf(engine, 'leg0_swing')).toBeCloseTo(-20 * D2R, 6);
    expect(ctrlOf(engine, 'leg1_swing')).toBeCloseTo((model.initial.values.leg1_swing ?? 0) * D2R, 6);

    engine.dispose();
  });
});

const ARMS = { left_shoulder_pitch_joint: -80, right_shoulder_pitch_joint: 80 };

function swingArms(model: SimModel) {
  const engine = new SimEngine(mj, model);

  engine.setController({ kind: 'drive', setup: poseSetup(model, Object.keys(ARMS)) });
  engine.command({ v: [0, 0, 0], joints: ARMS });
  engine.step(2);

  const robot = engine.stats().robots[0];
  const arms = Object.keys(ARMS).map((id) => qposOf(engine, id) / D2R);

  engine.dispose();

  return { robot, arms };
}

describe('a pinned base', () => {
  const body = humanoid();
  const rig = buildRig(body.joints, body.parts);
  const pinned = buildMjcf({
    parts: body.parts,
    rig,
    project: { ...DEFAULT_PROJECT, joints: body.joints },
    measures: fixtureMeasures(body.parts),
    partTriangles: fixtureTriangles(body.parts),
    fixedBase: { [rig.robots[0].key]: true },
  });

  it('keeps a floating humanoid’s root still while its arms follow a pose', () => {
    const floating = modelOf(body);

    expect(floating.robots[0].floating).toBe(true);
    expect(pinned.robots[0].floating).toBe(false);

    const { robot, arms } = swingArms(pinned);

    expect(Math.abs(robot.height)).toBeLessThan(1e-6);
    expect(robot.travelled).toBeLessThan(1e-6);
    expect(robot.tilt).toBeLessThan(1e-3);
    expect(robot.fellAt).toBeNull();
    expect(arms[0]).toBeLessThan(-40);
    expect(arms[1]).toBeGreaterThan(40);
  });
});
