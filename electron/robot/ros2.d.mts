export type ControllerKind = 'forward_position' | 'joint_trajectory' | 'diff_drive';

export const ROS2: 'ros2';

export const CONTROLLER_KINDS: readonly ControllerKind[];

export const ROS2_TOPICS: Readonly<Record<ControllerKind, string>>;

export const MAX_ROS2_JOINTS: number;

export const MAX_ROS2_TOPIC: number;

export const DIFF_DRIVE_JOINTS: number;

export function isControllerKind(kind: unknown): kind is ControllerKind;

export function isRos2JointName(name: unknown): name is string;

export function ros2TopicProblem(kind: unknown, topic: unknown): string | null;

export function ros2JointsProblem(kind: unknown, joints: unknown): string | null;
