import { describe, expect, it } from 'vitest';
import { isRos2JointName, ros2JointsProblem, ros2TopicProblem, ROS2_TOPICS } from '../../electron/robot/ros2.mjs';
import type { RobotJoint } from '../types/robotics';
import { jointRows } from './jointRows';
import { FAMILY_NAMES } from './robotFamilies';
import { ladderFor } from './robotState';
import { ros2Ask, rosJointNames } from './ros2';
import { sceneRobot, sceneRobotChoices } from './sceneRobot';
import { G1_JOINT_NAMES, G1_WRITABLE_JOINTS } from './unitreeG1';

const joint = (name: string, extra: Partial<RobotJoint> = {}): RobotJoint => ({
  id: `scene-${name}`,
  name,
  type: 'revolute',
  parent: [],
  child: [],
  origin: [0, 0, 0],
  axis: [1, 0, 0],
  ...extra,
});

const UR_JOINTS = [
  'shoulder_pan_joint',
  'shoulder_lift_joint',
  'elbow_joint',
  'wrist_1_joint',
  'wrist_2_joint',
  'wrist_3_joint',
];

const FORWARD_POSITION = { kind: 'forward_position', topic: '/forward_position_controller/commands' };

describe('ROS joint names', () => {
  it('keeps an imported URDF robot’s joint names as they are', () => {
    expect(rosJointNames(UR_JOINTS.map((name) => joint(name)))).toEqual(UR_JOINTS);
    expect(rosJointNames(G1_JOINT_NAMES.map((name) => joint(name)))).toEqual(G1_JOINT_NAMES);
  });

  it('turns any other name into a ROS name the daemon takes', () => {
    const names = rosJointNames(
      ['Shoulder', 'Left elbow', '1st wrist', 'Gelenk-ä', '関節', '', 'a'.repeat(80), 'wrist.roll'].map((name) =>
        joint(name),
      ),
    );

    expect(names).toEqual([
      'Shoulder',
      'Left_elbow',
      '_1st_wrist',
      'Gelenk__',
      '__',
      'scene_',
      'a'.repeat(64),
      'wrist_roll',
    ]);
    expect(names.every(isRos2JointName)).toBe(true);
  });

  it('gives a repeated name its own suffix, still within 64 characters', () => {
    const long = 'b'.repeat(70);
    const names = rosJointNames(
      ['elbow', 'elbow', 'Elbow', 'elbow_2', 'left elbow', 'left-elbow', long, long].map((name) => joint(name)),
    );

    expect(names).toEqual([
      'elbow',
      'elbow_2',
      'Elbow',
      'elbow_2_2',
      'left_elbow',
      'left_elbow_2',
      'b'.repeat(64),
      `${'b'.repeat(62)}_2`,
    ]);
    expect(new Set(names).size).toBe(names.length);
    expect(names.every(isRos2JointName)).toBe(true);
  });
});

describe('connecting a scene robot over ROS 2', () => {
  it('offers the scene’s own family first, then ROS 2 over the same joints', () => {
    const joints = [joint('Shoulder'), joint('mount', { type: 'fixed' }), joint('Elbow', { limb: 'leg' })];
    const robot = sceneRobotChoices(joints);

    expect(robot).toEqual({
      ok: true,
      choices: [
        {
          spec: { family: 'feetech', ids: [1, 2], class: 'legged', emulated: true },
          joints: ['scene-Shoulder', 'scene-Elbow'],
        },
        {
          spec: { family: 'ros2', emulated: true, controller: FORWARD_POSITION, joints: ['Shoulder', 'Elbow'] },
          joints: ['scene-Shoulder', 'scene-Elbow'],
        },
      ],
    });
    expect(sceneRobot(joints)).toEqual({ ok: true, ...(robot.ok && robot.choices[0]) });
  });

  it('asks with names and a topic the main process accepts, in scene joint order', () => {
    const ask = ros2Ask(UR_JOINTS.map((name) => joint(name)));

    expect(ask).toEqual({
      family: 'ros2',
      emulated: true,
      controller: { kind: 'forward_position', topic: ROS2_TOPICS.forward_position },
      joints: UR_JOINTS,
    });
    expect(ros2TopicProblem(ask.controller.kind, ask.controller.topic)).toBeNull();
    expect(ros2JointsProblem(ask.controller.kind, ask.joints)).toBeNull();
  });

  it('offers a G1 as itself first and as ROS 2 over all 29 joints', () => {
    const robot = sceneRobotChoices(G1_JOINT_NAMES.map((name) => joint(name)));

    expect(robot.ok && robot.choices.map((c) => c.spec.family)).toEqual(['unitree-g1', 'ros2']);
    expect(robot.ok && robot.choices[0].joints).toEqual(G1_WRITABLE_JOINTS.map((name) => `scene-${name}`));
    expect(robot.ok && robot.choices[1].joints).toHaveLength(29);
    expect(robot.ok && robot.choices[1].spec).toMatchObject({ joints: G1_JOINT_NAMES });
  });

  it('offers nothing past 32 movable joints, or with none', () => {
    const many = Array.from({ length: 33 }, (_, k) => joint(`j${k}`));

    expect(sceneRobotChoices(many).ok).toBe(false);
    expect(sceneRobotChoices([joint('mount', { type: 'fixed' })]).ok).toBe(false);
    expect(ros2JointsProblem('forward_position', ros2Ask(many.slice(0, 32)).joints)).toBeNull();
  });

  it('climbs to Test only, names the family ROS 2 and joins rows by the order recorded at Connect', () => {
    const joints = [joint('Shoulder'), joint('Elbow')];
    const robot = sceneRobotChoices(joints);
    const ros2 = robot.ok ? robot.choices[1] : null;
    const ids = [1, 2];
    const reading = (id: number, position: number) => ({
      id,
      position,
      temp_c: null,
      volts: null,
      torque_on: true,
      reply: 'ok',
    });
    const rows = jointRows({
      joints,
      calibrations: undefined,
      connection: { ids, jointIds: ros2?.joints ?? null, readings: [reading(2, 2100), reading(1, 2000)] },
    });

    expect(ladderFor({ family: 'ros2' })).toEqual(['look', 'set_up', 'test']);
    expect(FAMILY_NAMES.ros2).toBe('ROS 2');
    expect(rows.map((r) => [r.busId, r.joint?.name, r.reading?.position])).toEqual([
      [1, 'Shoulder', 2000],
      [2, 'Elbow', 2100],
    ]);
  });
});
