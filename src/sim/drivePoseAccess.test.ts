import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { caseRobot } from '../cases/testing';
import { DEFAULT_PROJECT } from '../types/robotics';
import { humanoid } from '../utils/mocap.fixtures';
import { buildRig } from '../utils/kinematics';
import { driveAccess, poseOffer, posePin, type VelocityDrive } from './driveAccess';
import { SimEngine } from './engine';
import { box, joint } from './fixtures/parts';
import { fixtureRobots } from './fixtures/robots';
import { buildMjcf } from './mjcf';
import type { PolicySpec } from './policy';

const D2R = Math.PI / 180;

const stubVelocity: VelocityDrive = { policy: { joints: [] } as unknown as PolicySpec, topSpeed: 0.15 };

function g1(pin?: string) {
  const { parts, joints, rig } = humanoid();
  const model = buildMjcf({
    ...caseRobot({ id: 'g1', parts, joints, expect: { morphology: 'legged', stand: 'n/a', walk: 'n/a' } }),
    rig,
    project: { ...DEFAULT_PROJECT, joints },
    ...(pin ? { fixedBase: { [pin]: true } } : {}),
  });

  return { parts, rig, model };
}

describe('driving by pose', () => {
  it('pins a humanoid without a walk skill and drives its upper body', () => {
    const { parts, rig, model } = g1();
    const access = driveAccess({ rig, parts, model, pose: true });

    expect(access).toMatchObject({ kind: 'ready', cls: 'pose', pin: model.robots[0].key });
    expect(posePin({ rig, parts })).toBe(model.robots[0].key);

    const pinned = g1(model.robots[0].key);
    const again = driveAccess({ rig, parts, model: pinned.model, pose: true });

    expect(again).toMatchObject({ kind: 'ready', cls: 'pose' });
    expect(again.kind === 'ready' && again.pin).toBeFalsy();
  });

  it('runs a ready walk skill under the arms instead of pinning', () => {
    const { parts, rig, model } = g1();
    const access = driveAccess({ rig, parts, model, pose: true, velocity: stubVelocity });

    expect(access.kind).toBe('policy');
    expect(access.kind === 'policy' && access.pose?.joints.some((j) => j.id === 'right_elbow_joint')).toBe(true);
  });

  it('drives a fixed arm by its hand, and offers nothing to a rover', () => {
    const arm = fixtureRobots().find((r) => r.id.startsWith('arm'))!;
    const rover = fixtureRobots().find((r) => r.id === 'rover-diff')!;
    const armRig = buildRig(arm.joints, arm.parts);
    const model = buildMjcf({ ...caseRobot(arm), rig: armRig, project: DEFAULT_PROJECT });

    expect(driveAccess({ rig: armRig, parts: arm.parts, model, pose: true })).toMatchObject({ cls: 'arm' });
    expect(posePin({ rig: armRig, parts: arm.parts })).toBeNull();
    expect(poseOffer({ rig: armRig, parts: arm.parts })).toBe(true);
    expect(poseOffer({ rig: buildRig(rover.joints, rover.parts), parts: rover.parts })).toBe(false);
  });

  it('drives a rover with a pan camera by its wheels, unpinned, when a pose input is asked for', () => {
    const rover = fixtureRobots().find((r) => r.id === 'rover-diff')!;
    const camera = {
      ...box('cam', [0, 120, 0], [25, 12, 24], 4),
      kind: 'component' as const,
      category: 'perception' as const,
      componentId: 'raspberry-pi-camera-3',
    };
    const parts = [...rover.parts, box('turret', [0, 100, 0], [40, 20, 40], 40), camera];
    const pan = joint({
      id: 'pan',
      link: ['chassis', 'turret'],
      origin: [0, 90, 0],
      axis: [0, 1, 0],
      effortNm: 1,
      range: [-90, 90],
    });
    const joints = [...rover.joints, { ...pan, child: [...pan.child, camera.id] }];
    const rig = buildRig(joints, parts);
    const model = buildMjcf({
      ...caseRobot({ ...rover, parts, joints }),
      rig,
      project: { ...DEFAULT_PROJECT, joints },
    });

    expect(model.robots[0].floating).toBe(true);
    expect(driveAccess({ rig, parts, model, pose: true })).toMatchObject({ kind: 'ready', cls: 'rover' });
  });

  it('moves the commanded shoulder in the sim while the pinned base and legs stay still', async () => {
    const mj = await loadMujoco();
    const first = g1();
    const { parts, rig, model } = g1(first.model.robots[0].key);
    const access = driveAccess({ rig, parts, model, pose: true });

    if (access.kind !== 'ready') throw new Error(`expected a pose drive, got ${access.kind}`);

    const engine = new SimEngine(mj, model);
    const index = (id: string) => model.joints.findIndex((j) => j.id === id);
    const position = (id: string) => engine.jointStates()[index(id) * 3 + 1] / D2R;
    const base = () => Array.from(engine.poses().subarray(0, 3));

    engine.setController({ kind: 'drive', setup: access.setup });
    engine.step(0.2);

    const knee = position('left_knee_joint');
    const before = base();

    engine.command({ v: [0, 0, 0], joints: { right_shoulder_pitch_joint: -60, left_knee_joint: 40 } });
    engine.step(1.5);

    expect(position('right_shoulder_pitch_joint')).toBeLessThan(-45);
    expect(Math.abs(position('left_knee_joint') - knee)).toBeLessThan(2);
    base().forEach((x, i) => expect(x).toBeCloseTo(before[i], 3));
    engine.dispose();
  });
});
