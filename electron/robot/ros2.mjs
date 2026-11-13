export const ROS2 = 'ros2';

export const CONTROLLER_KINDS = Object.freeze(['forward_position', 'joint_trajectory', 'diff_drive']);

export const ROS2_TOPICS = Object.freeze({
  forward_position: '/forward_position_controller/commands',
  joint_trajectory: '/joint_trajectory_controller/joint_trajectory',
  diff_drive: '/cmd_vel',
});

export const MAX_ROS2_JOINTS = 32;
export const MAX_ROS2_TOPIC = 128;
export const DIFF_DRIVE_JOINTS = 2;

const TOPIC = /^(\/[A-Za-z_]\w*){1,4}$/;
const JOINT_NAME = /^[A-Za-z_]\w{0,63}$/;

const LAST_SEGMENTS = Object.freeze({
  forward_position: ['commands'],
  joint_trajectory: ['joint_trajectory'],
  diff_drive: ['cmd_vel', 'cmd_vel_unstamped'],
});

export const isControllerKind = (kind) => CONTROLLER_KINDS.includes(kind);

export const isRos2JointName = (name) => typeof name === 'string' && JOINT_NAME.test(name);

const isRos2Topic = (topic) =>
  typeof topic === 'string' && topic.length <= MAX_ROS2_TOPIC && !topic.includes('__') && TOPIC.test(topic);

export function ros2TopicProblem(kind, topic) {
  if (!isControllerKind(kind)) return 'Choose a forward position, joint trajectory or diff drive controller.';

  const fits = isRos2Topic(topic) && LAST_SEGMENTS[kind].includes(topic.split('/').at(-1));

  return fits ? null : `Use a ROS topic like ${ROS2_TOPICS[kind]}.`;
}

export function ros2JointsProblem(kind, joints) {
  const count = Array.isArray(joints) ? joints.length : 0;

  if (count === 0 || count > MAX_ROS2_JOINTS) return `Give 1 to ${MAX_ROS2_JOINTS} joints.`;

  if (kind === 'diff_drive' && count !== DIFF_DRIVE_JOINTS)
    return 'A diff drive takes two joints: left wheel, then right.';

  if (![...joints].every(isRos2JointName)) return 'Name each joint with letters, digits and underscores.';

  return new Set(joints).size === count ? null : 'Each joint needs its own name.';
}
