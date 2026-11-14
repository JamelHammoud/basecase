import type { RobotFamily } from './robotState';

export const FAMILY_NAMES: Readonly<Record<RobotFamily, string>> = {
  feetech: 'Feetech',
  dynamixel: 'Dynamixel',
  'unitree-g1': 'G1',
  ros2: 'ROS 2',
};
