import { describe, expect, it } from 'vitest';
import type { RobotJoint } from '../types/robotics';
import { limbOf } from '../utils/robotImport/published';
import { ROBOT_PRESETS } from '../utils/robotImport/presets';
import { sceneRobot } from './sceneRobot';
import {
  G1_JOINT_NAMES,
  G1_LEG_JOINTS,
  G1_WRITABLE_IDS,
  G1_WRITABLE_JOINTS,
  g1JointId,
  g1WritableSceneJoints,
  isUnitreeG1,
} from './unitreeG1';

const SIDES = ['left', 'right'];
const LEG = ['hip_pitch', 'hip_roll', 'hip_yaw', 'knee', 'ankle_pitch', 'ankle_roll'];
const ARM = ['shoulder_pitch', 'shoulder_roll', 'shoulder_yaw', 'elbow', 'wrist_roll', 'wrist_pitch', 'wrist_yaw'];
const URDF_ORDER = [
  ...SIDES.flatMap((side) => LEG.map((j) => `${side}_${j}_joint`)),
  'waist_yaw_joint',
  'waist_roll_joint',
  'waist_pitch_joint',
  ...SIDES.flatMap((side) => ARM.map((j) => `${side}_${j}_joint`)),
];

const joint = (name: string, extra: Partial<RobotJoint> = {}): RobotJoint => ({
  id: `scene-${name}`,
  name,
  type: 'revolute',
  parent: [],
  child: [],
  origin: [0, 0, 0],
  axis: [1, 0, 0],
  limb: limbOf(name),
  ...extra,
});

const shuffled = <T>(items: readonly T[]) => items.map((_, i) => items[(i * 7) % items.length]);

const g1Joints = () => shuffled(URDF_ORDER).map((name) => joint(name));

describe('Unitree G1 joint map', () => {
  it('lists the preset’s 29 joints in unitree_sdk2 motor order', () => {
    const preset = ROBOT_PRESETS.find((p) => p.id === 'unitree-g1');

    expect(preset?.url).toMatch(/g1_29dof_rev_1_0\.urdf$/);
    expect(G1_JOINT_NAMES).toHaveLength(preset?.joints ?? 0);
    expect(G1_JOINT_NAMES).toEqual(URDF_ORDER);
    expect(new Set(G1_JOINT_NAMES).size).toBe(29);
  });

  it('keeps the legs at motors 0 to 11 and never writes them', () => {
    expect(G1_LEG_JOINTS).toEqual(G1_JOINT_NAMES.slice(0, 12));
    expect(G1_LEG_JOINTS.every((name) => limbOf(name) === 'leg')).toBe(true);
    expect(G1_WRITABLE_JOINTS.some((name) => G1_LEG_JOINTS.includes(name))).toBe(false);
    expect(G1_WRITABLE_JOINTS.some((name) => limbOf(name) === 'leg')).toBe(false);
  });

  it('writes the waist and arms in daemon id order 13 to 29', () => {
    expect(G1_WRITABLE_IDS).toEqual(Array.from({ length: 17 }, (_, k) => k + 13));
    expect(G1_WRITABLE_JOINTS.map((name) => g1JointId(G1_JOINT_NAMES.indexOf(name)))).toEqual(G1_WRITABLE_IDS);
    expect(G1_WRITABLE_JOINTS[0]).toBe('waist_yaw_joint');
    expect(G1_WRITABLE_JOINTS[23 - 13]).toBe('right_shoulder_pitch_joint');
  });

  it('connects the imported G1 as itself, its 17 writable joints in id order', () => {
    const joints = [...g1Joints(), joint('logo_joint', { type: 'fixed' })];
    const robot = sceneRobot(joints);

    expect(isUnitreeG1(joints.filter((j) => j.type !== 'fixed'))).toBe(true);
    expect(robot).toEqual({
      ok: true,
      spec: { family: 'unitree-g1', emulated: true },
      joints: G1_WRITABLE_JOINTS.map((name) => `scene-${name}`),
    });
    expect(g1WritableSceneJoints(joints)).toHaveLength(17);
  });

  it('treats a robot missing a G1 joint, or with one more, as plain servos', () => {
    const missing = g1Joints().filter((j) => j.name !== 'right_elbow_joint');
    const extra = [...g1Joints(), joint('head_joint')];
    const renamed = g1Joints().map((j) => (j.name === 'waist_yaw_joint' ? { ...j, name: 'Waist Yaw' } : j));

    for (const joints of [missing, extra, renamed]) {
      const robot = sceneRobot(joints);

      expect(isUnitreeG1(joints)).toBe(false);
      expect(robot.ok && robot.spec.family).toBe('feetech');
    }
  });
});
