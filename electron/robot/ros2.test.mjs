import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { RobotLink } from './robotLink.mjs';
import { ROS2_TOPICS, isRos2JointName, ros2TopicProblem } from './ros2.mjs';
import { checkedRobotSpec } from './robotSpec.mjs';

const ARM = {
  family: 'ros2',
  emulated: true,
  controller: { kind: 'forward_position', topic: '/forward_position_controller/commands' },
  joints: ['shoulder_pan_joint', 'elbow_joint'],
};
const BASE = {
  family: 'ros2',
  emulated: true,
  controller: { kind: 'diff_drive', topic: '/cmd_vel' },
  joints: ['left_wheel_joint', 'right_wheel_joint'],
};
const REFUSAL =
  /^(Only an emulated ROS 2 robot|Real motors are locked|Choose a|Use a ROS topic|Give 1 to|A diff drive|Name each|Each joint)/;

function fakeChild() {
  const child = new EventEmitter();

  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = vi.fn();

  return child;
}

function linkWithFake() {
  const binary = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-ros2-test-')), 'robot-daemon');

  fs.writeFileSync(binary, '');

  const spawned = [];
  const events = [];
  const link = new RobotLink({
    binary,
    emit: (e) => events.push(e),
    spawnFn: (bin, args) => {
      const child = fakeChild();

      spawned.push({ bin, args, child });

      return child;
    },
  });

  return { link, spawned, events };
}

const withController = (controller) => ({ ...ARM, controller });
const withTopic = (topic) => withController({ kind: 'forward_position', topic });
const withJoints = (joints) => ({ ...ARM, joints });
const inherits = (proto, own) => Object.assign(Object.create(proto), own);

const holey = [];

holey[1] = 'elbow';

const CRAFTED_TOPICS = [
  '/x/../commands',
  'rt/x/commands',
  'x/commands',
  '/x;rm -rf/commands',
  '/a__b/commands',
  '/x/commands/',
  '//commands',
  '/1x/commands',
  '/a/b/c/d/commands',
  '/forward_position_controller/commands\0',
  '/joint_trajectory_controller/joint_trajectory',
  '/cmd_vel',
  `/${'a'.repeat(119)}/commands`,
  '/x/commands --emulated',
  '',
  42,
  null,
  ['/forward_position_controller/commands'],
  { toString: () => '/forward_position_controller/commands' },
];

const CRAFTED_JOINTS = [
  ['a,b'],
  ['--port'],
  ['-x'],
  ['shoulder joint'],
  ['schulter_gelenk_ä'],
  ['関節'],
  ['1joint'],
  ['a'.repeat(65)],
  ['elbow', 'elbow'],
  Array.from({ length: 33 }, (_, k) => `j${k}`),
  [],
  [''],
  [42],
  [null],
  'shoulder,elbow',
  { 0: 'shoulder', length: 1 },
  holey,
  null,
];

describe('ROS 2 topic and joint names', () => {
  it('takes the default topic of each controller and its documented variants', () => {
    for (const [kind, topic] of Object.entries(ROS2_TOPICS)) expect(ros2TopicProblem(kind, topic), kind).toBeNull();

    expect(ros2TopicProblem('diff_drive', '/base/cmd_vel_unstamped')).toBeNull();
    expect(ros2TopicProblem('forward_position', '/a/b/commands')).toBeNull();
    expect(ros2TopicProblem('forward_position', `/${'a'.repeat(118)}/commands`)).toBeNull();
  });

  it('refuses crafted topics, a topic for another controller, and a 129-character topic', () => {
    expect(`/${'a'.repeat(119)}/commands`).toHaveLength(129);

    for (const topic of CRAFTED_TOPICS)
      expect(ros2TopicProblem('forward_position', topic), JSON.stringify(topic)).toMatch(/^Use a ROS topic/);

    expect(ros2TopicProblem('velocity', '/cmd_vel')).toMatch(/^Choose a/);
    expect(ros2TopicProblem('__proto__', '/cmd_vel')).toMatch(/^Choose a/);
  });

  it('names joints with letters, digits and underscores, starting with a letter or underscore', () => {
    for (const name of ['shoulder_pan_joint', '_hidden', 'J1', 'a'.repeat(64)])
      expect(isRos2JointName(name)).toBe(true);

    for (const name of ['a,b', '--port', 'a b', 'ä', '1a', 'a'.repeat(65), '', 7, null])
      expect(isRos2JointName(name), String(name)).toBe(false);
  });
});

describe('robot link for an emulated ROS 2 robot', () => {
  it('checks a forward position arm and spawns it with the contract argv, never a port or interface', () => {
    const { link, spawned, events } = linkWithFake();
    const spec = { ...ARM, ids: [1, 2], class: 'arm' };

    expect(checkedRobotSpec(ARM)).toEqual({ ok: true, spec });
    expect(link.connect(ARM)).toEqual({ ok: true });
    expect(events.at(-1)).toEqual({ event: 'link', state: 'connected', spec });

    const [{ args }] = spawned;
    const artefacts = args[args.indexOf('--artefacts') + 1];
    const calibration = JSON.parse(fs.readFileSync(path.join(artefacts, 'calibration.json'), 'utf8'));

    expect(args).toEqual([
      '--family',
      'ros2',
      '--controller',
      'forward_position',
      '--topic',
      '/forward_position_controller/commands',
      '--joints',
      'shoulder_pan_joint,elbow_joint',
      '--emulated',
      '--artefacts',
      artefacts,
    ]);
    expect(calibration).toEqual({
      joints: [
        { id: 1, name: 'shoulder_pan_joint', zero_counts: 2048, direction: 1, min_rad: -2.8, max_rad: 2.8 },
        { id: 2, name: 'elbow_joint', zero_counts: 2048, direction: 1, min_rad: -2.8, max_rad: 2.8 },
      ],
      class: 'arm',
    });
    expect(link.command({ cmd: 'intent', joints: [0.1, -0.2] })).toEqual({ ok: true });
    expect(link.command({ cmd: 'intent', joints: [0.1] }).ok).toBe(false);
    link.disconnect();
  });

  it('copies the checked spec, so the ask changing later changes nothing', () => {
    const ask = structuredClone(ARM);
    const { spec } = checkedRobotSpec(ask);

    ask.joints.push('wrist');
    ask.controller.topic = '/x;rm/commands';
    expect(spec.joints).toEqual(ARM.joints);
    expect(spec.controller.topic).toBe(ARM.controller.topic);
  });

  it('spawns a diff drive with two wheel joints and takes two-value intents', () => {
    const { link, spawned } = linkWithFake();

    expect(link.connect(BASE)).toEqual({ ok: true });
    expect(spawned[0].args.slice(0, 8)).toEqual([
      '--family',
      'ros2',
      '--controller',
      'diff_drive',
      '--topic',
      '/cmd_vel',
      '--joints',
      'left_wheel_joint,right_wheel_joint',
    ]);
    expect(link.state().spec.ids).toEqual([1, 2]);
    expect(link.command({ cmd: 'intent', joints: [0.3, -0.5] })).toEqual({ ok: true });
    expect(link.command({ cmd: 'intent', joints: [0.3, -0.5, 0] }).ok).toBe(false);
    link.disconnect();
  });

  it('takes a joint trajectory controller on its own topic', () => {
    const ask = withController({ kind: 'joint_trajectory', topic: ROS2_TOPICS.joint_trajectory });

    expect(checkedRobotSpec(ask).ok).toBe(true);
  });

  it('refuses every crafted ask in plain words and spawns nothing', () => {
    const asks = [
      ...CRAFTED_TOPICS.map(withTopic),
      ...CRAFTED_JOINTS.map(withJoints),
      withController({ kind: 'forward_position', topic: ROS2_TOPICS.joint_trajectory }),
      withController({ kind: 'diff_drive', topic: '/forward_position_controller/commands' }),
      withController({ kind: 'forward_position', topic: ROS2_TOPICS.forward_position, qos: 'best_effort' }),
      withController({ kind: 'forward_position' }),
      withController(inherits({ topic: ROS2_TOPICS.forward_position }, { kind: 'forward_position' })),
      withController(inherits({ kind: 'forward_position', topic: ROS2_TOPICS.forward_position }, {})),
      withController([ROS2_TOPICS.forward_position]),
      withController('forward_position'),
      withController(null),
      { ...BASE, joints: ['left_wheel_joint', 'right_wheel_joint', 'caster_joint'] },
      { ...BASE, joints: ['left_wheel_joint'] },
      { ...ARM, port: '/dev/ttyUSB0' },
      { ...ARM, interface: 'en0' },
      { ...ARM, ids: [1, 2] },
      { ...ARM, class: 'arm' },
      { ...ARM, factory: true },
      { ...ARM, emulated: false },
      { ...ARM, emulated: 'true' },
      { ...ARM, emulated: 1 },
      { family: 'ros2', emulated: true, joints: ARM.joints },
      { family: 'ros2', emulated: true, controller: ARM.controller },
      inherits({ controller: ARM.controller }, { family: 'ros2', emulated: true, joints: ARM.joints }),
      inherits({ interface: 'en0' }, ARM),
      inherits({ family: 'ros2' }, { emulated: true, controller: ARM.controller, joints: ARM.joints }),
      { ...ARM, family: 'ros2 --interface en0' },
      { ...ARM, family: 'ROS2' },
    ];
    const { link, spawned } = linkWithFake();

    for (const ask of asks) {
      const reply = checkedRobotSpec(ask);

      expect(reply.ok, JSON.stringify(ask)).toBe(false);
      expect(reply.message, JSON.stringify(ask)).toMatch(new RegExp(`${REFUSAL.source}|^Only an emulated robot`));
      expect(link.connect(ask).ok).toBe(false);
    }

    expect(spawned).toEqual([]);
  });

  it('names the joints in its refusals by rule, not by echoing what was asked', () => {
    const reply = checkedRobotSpec(withJoints(['--port /dev/ttyUSB0']));

    expect(reply).toEqual({ ok: false, message: 'Name each joint with letters, digits and underscores.' });
    expect(checkedRobotSpec(withJoints(['a', 'a'])).message).toBe('Each joint needs its own name.');
    expect(checkedRobotSpec(withJoints(Array.from({ length: 33 }, (_, k) => `j${k}`))).message).toBe(
      'Give 1 to 32 joints.',
    );
    expect(checkedRobotSpec({ ...ARM, emulated: false }).message).toMatch(/^Real motors are locked/);
  });
});
