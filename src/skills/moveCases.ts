import type { FixtureRobot } from '../sim/fixtures/parts';
import type { SimModel } from '../sim/mjcfTypes';
import type { RobotAnimation } from '../types/robotics';
import { fixtureModel, fixtureRobot, modelOf } from './fixtureModels';
import { BIPED_LEGS, retargetedMove, squatWaveBvh } from './moveCaseBvh';
import { g1Humanoid } from './moveCaseRobots';
import { keyedMove, quadSit } from './moveFixtures';
import type { Method } from './router';

export interface MoveCase {
  id: string;
  robot: string | FixtureRobot;
  animation: RobotAnimation;
  expect: Extract<Method, 'tracking' | 'ik-or-motion-plan'>;
}

export const caseModel = (c: Pick<MoveCase, 'robot'>): SimModel =>
  typeof c.robot === 'string' ? fixtureModel(c.robot) : modelOf(c.robot);

export const robotName = (c: Pick<MoveCase, 'robot'>) => (typeof c.robot === 'string' ? c.robot : c.robot.id);

export const bipedSquat = (): RobotAnimation =>
  retargetedMove({
    robot: fixtureRobot('biped-servo'),
    bvh: squatWaveBvh(),
    name: 'Squat and wave',
    joints: BIPED_LEGS,
  });

const REAR_SIT = { leg2_swing: 25, leg2_bend: -45, leg3_swing: 25, leg3_bend: -45 };
const PAW_UP = { ...REAR_SIT, leg1_bend: -40 };

export const quadShake = (): RobotAnimation =>
  keyedMove({
    id: 'shake',
    name: 'Shake a paw',
    seconds: 3,
    keys: [
      [0, {}],
      [0.5, REAR_SIT],
      [1, { ...PAW_UP, leg1_swing: 60 }],
      [1.3, { ...PAW_UP, leg1_swing: 85 }],
      [1.6, { ...PAW_UP, leg1_swing: 45 }],
      [1.9, { ...PAW_UP, leg1_swing: 85 }],
      [2.2, { ...PAW_UP, leg1_swing: 45 }],
      [2.6, REAR_SIT],
      [3, {}],
    ],
  });

const TRIPODS = [
  [0, 3, 4],
  [1, 2, 5],
];

function tripodPose(lifted: number): Record<string, number> {
  return Object.fromEntries(
    TRIPODS.flatMap((legs, i) =>
      legs.flatMap((leg) => [
        [`leg${leg}_swing`, i === lifted ? 40 : 20],
        [`leg${leg}_bend`, i === lifted ? -80 : -40],
      ]),
    ),
  );
}

export const BEAT_S = 60 / 120;

export const hexapodDance = (): RobotAnimation =>
  keyedMove({
    id: 'dance',
    name: 'Dance step',
    seconds: 2 * BEAT_S,
    loop: true,
    keys: [
      [0, tripodPose(0)],
      [BEAT_S, tripodPose(1)],
    ],
  });

const BOW = { l_pitch: 40, r_pitch: 40, l_bend: 20, r_bend: 20, l_tilt: -20, r_tilt: -20 };

export const bipedBow = (): RobotAnimation =>
  keyedMove({
    id: 'bow',
    name: 'Bow',
    seconds: 2,
    keys: [
      [0, {}],
      [0.8, BOW],
      [1.2, BOW],
      [2, {}],
    ],
  });

const RAISED = { right_shoulder_roll_joint: 100, right_shoulder_pitch_joint: 0 };

export const humanoidWave = (): RobotAnimation =>
  keyedMove({
    id: 'wave',
    name: 'Wave',
    seconds: 2,
    loop: true,
    keys: [
      [0, { ...RAISED, right_elbow_joint: 0 }],
      [1, { ...RAISED, right_elbow_joint: 80 }],
    ],
  });

export const armWave = (): RobotAnimation =>
  keyedMove({
    id: 'arm-wave',
    name: 'Wave',
    seconds: 3,
    keys: [
      [0, {}],
      [0.6, { arm0: 45, arm1: 30, arm2: 0 }],
      [1.1, { arm0: 45, arm1: 30, arm2: 35 }],
      [1.6, { arm0: 45, arm1: 30, arm2: -35 }],
      [2.1, { arm0: 45, arm1: 30, arm2: 35 }],
      [2.6, { arm0: 45, arm1: 30, arm2: 0 }],
      [3, {}],
    ],
  });

export function moveCases(): MoveCase[] {
  return [
    { id: 'biped-squat-mocap', robot: 'biped-servo', animation: bipedSquat(), expect: 'tracking' },
    { id: 'quad-sit', robot: 'quad-servo', animation: quadSit(), expect: 'tracking' },
    { id: 'quad-shake', robot: 'quad-servo', animation: quadShake(), expect: 'tracking' },
    { id: 'hexapod-dance', robot: 'hexapod', animation: hexapodDance(), expect: 'tracking' },
    { id: 'biped-bow', robot: 'biped-servo', animation: bipedBow(), expect: 'tracking' },
    { id: 'humanoid-wave', robot: g1Humanoid(), animation: humanoidWave(), expect: 'tracking' },
    { id: 'arm-wave', robot: 'arm-3dof', animation: armWave(), expect: 'ik-or-motion-plan' },
  ];
}

export function moveCase(id: string): MoveCase {
  const found = moveCases().find((c) => c.id === id);

  if (!found) throw new Error(`No move case ${id}.`);

  return found;
}
