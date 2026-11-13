export const UNITREE_G1 = 'unitree-g1';

export const G1_JOINT_NAMES = Object.freeze([
  'left_hip_pitch_joint',
  'left_hip_roll_joint',
  'left_hip_yaw_joint',
  'left_knee_joint',
  'left_ankle_pitch_joint',
  'left_ankle_roll_joint',
  'right_hip_pitch_joint',
  'right_hip_roll_joint',
  'right_hip_yaw_joint',
  'right_knee_joint',
  'right_ankle_pitch_joint',
  'right_ankle_roll_joint',
  'waist_yaw_joint',
  'waist_roll_joint',
  'waist_pitch_joint',
  'left_shoulder_pitch_joint',
  'left_shoulder_roll_joint',
  'left_shoulder_yaw_joint',
  'left_elbow_joint',
  'left_wrist_roll_joint',
  'left_wrist_pitch_joint',
  'left_wrist_yaw_joint',
  'right_shoulder_pitch_joint',
  'right_shoulder_roll_joint',
  'right_shoulder_yaw_joint',
  'right_elbow_joint',
  'right_wrist_roll_joint',
  'right_wrist_pitch_joint',
  'right_wrist_yaw_joint',
]);

export const G1_FIRST_WRITABLE = 12;

export const g1JointId = (motorIndex) => motorIndex + 1;

export const g1JointName = (id) => G1_JOINT_NAMES[id - 1];

export const G1_WRITABLE_IDS = Object.freeze(
  G1_JOINT_NAMES.slice(G1_FIRST_WRITABLE).map((_, k) => g1JointId(G1_FIRST_WRITABLE + k)),
);
