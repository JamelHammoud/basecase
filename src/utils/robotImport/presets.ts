import { RAW } from './sources';

export type RobotCategory = 'Humanoids' | 'Small bipeds' | 'Quadrupeds' | 'Arms';
export const ROBOT_CATEGORIES: RobotCategory[] = ['Humanoids', 'Small bipeds', 'Quadrupeds', 'Arms'];

export interface RobotPreset {
  id: string;
  title: string;
  maker: string;
  category: RobotCategory;
  joints: number;
  description: string;
  url: string;
}

const UNITREE = `${RAW}/unitreerobotics/unitree_ros/master/robots`;
const MENAGERIE = `${RAW}/google-deepmind/mujoco_menagerie/main`;

export const ROBOT_PRESETS: RobotPreset[] = [
  {
    id: 'unitree-g1',
    title: 'Unitree G1',
    maker: 'Unitree',
    category: 'Humanoids',
    joints: 29,
    description: '1.3 m humanoid',
    url: `${UNITREE}/g1_description/g1_29dof_rev_1_0.urdf`,
  },
  {
    id: 'unitree-h1',
    title: 'Unitree H1',
    maker: 'Unitree',
    category: 'Humanoids',
    joints: 19,
    description: '1.8 m humanoid',
    url: `${UNITREE}/h1_description/urdf/h1.urdf`,
  },
  {
    id: 'unitree-h1-2',
    title: 'Unitree H1-2',
    maker: 'Unitree',
    category: 'Humanoids',
    joints: 51,
    description: '1.8 m humanoid with dexterous hands',
    url: `${UNITREE}/h1_2_description/h1_2.urdf`,
  },
  {
    id: 'apptronik-apollo',
    title: 'Apptronik Apollo',
    maker: 'Apptronik',
    category: 'Humanoids',
    joints: 32,
    description: '1.7 m humanoid with hands',
    url: `${MENAGERIE}/apptronik_apollo/apptronik_apollo.xml`,
  },
  {
    id: 'booster-t1',
    title: 'Booster T1',
    maker: 'Booster Robotics',
    category: 'Humanoids',
    joints: 23,
    description: '1.2 m humanoid',
    url: `${MENAGERIE}/booster_t1/t1.xml`,
  },
  {
    id: 'berkeley-humanoid',
    title: 'Berkeley Humanoid',
    maker: 'UC Berkeley',
    category: 'Humanoids',
    joints: 12,
    description: 'Research humanoid, legs only',
    url: `${RAW}/HybridRobotics/berkeley_humanoid_description/main/urdf/robot.urdf`,
  },
  {
    id: 'robotis-op3',
    title: 'ROBOTIS OP3',
    maker: 'ROBOTIS',
    category: 'Small bipeds',
    joints: 20,
    description: '51 cm humanoid on Dynamixel servos',
    url: `${MENAGERIE}/robotis_op3/op3.xml`,
  },
  {
    id: 'open-duck-mini',
    title: 'Open Duck Mini v2',
    maker: 'Antoine Pirrone',
    category: 'Small bipeds',
    joints: 16,
    description: 'Open-source printed biped',
    url: `${RAW}/apirrone/Open_Duck_Mini/v2/mini_bdx/robots/open_duck_mini_v2/robot.urdf`,
  },
  {
    id: 'unitree-go2',
    title: 'Unitree Go2',
    maker: 'Unitree',
    category: 'Quadrupeds',
    joints: 12,
    description: 'Consumer quadruped',
    url: `${UNITREE}/go2_description/urdf/go2_description.urdf`,
  },
  {
    id: 'unitree-go1',
    title: 'Unitree Go1',
    maker: 'Unitree',
    category: 'Quadrupeds',
    joints: 12,
    description: 'Consumer quadruped',
    url: `${UNITREE}/go1_description/urdf/go1.urdf`,
  },
  {
    id: 'unitree-b2',
    title: 'Unitree B2',
    maker: 'Unitree',
    category: 'Quadrupeds',
    joints: 12,
    description: 'Industrial quadruped',
    url: `${UNITREE}/b2_description/urdf/b2_description.urdf`,
  },
  {
    id: 'anymal-c',
    title: 'ANYmal C',
    maker: 'ANYbotics',
    category: 'Quadrupeds',
    joints: 12,
    description: 'Industrial inspection quadruped',
    url: `${MENAGERIE}/anybotics_anymal_c/anymal_c.xml`,
  },
  {
    id: 'spot',
    title: 'Spot',
    maker: 'Boston Dynamics',
    category: 'Quadrupeds',
    joints: 12,
    description: 'Quadruped',
    url: `${MENAGERIE}/boston_dynamics_spot/spot.xml`,
  },
  {
    id: 'so101',
    title: 'SO-101 Arm',
    maker: 'TheRobotStudio',
    category: 'Arms',
    joints: 6,
    description: 'Open-source 6-axis printed arm',
    url: `${RAW}/TheRobotStudio/SO-ARM100/main/Simulation/SO101/so101_new_calib.urdf`,
  },
  {
    id: 'franka-panda',
    title: 'Franka Panda',
    maker: 'Franka Robotics',
    category: 'Arms',
    joints: 9,
    description: '7-axis arm with gripper',
    url: `${MENAGERIE}/franka_emika_panda/panda.xml`,
  },
  {
    id: 'ur5e',
    title: 'UR5e',
    maker: 'Universal Robots',
    category: 'Arms',
    joints: 6,
    description: '6-axis collaborative arm',
    url: `${MENAGERIE}/universal_robots_ur5e/ur5e.xml`,
  },
];
