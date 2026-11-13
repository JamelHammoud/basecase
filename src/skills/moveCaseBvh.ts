import * as THREE from 'three';
import type { FixtureRobot } from '../sim/fixtures/parts';
import type { RobotAnimation } from '../types/robotics';
import { goalParts, type PointOf } from '../utils/animation';
import { buildRig, type Rig } from '../utils/kinematics';
import { parseBvh, retarget, type Keypoint } from '../utils/mocap';

export interface SquatShape {
  seconds: number;
  downS: number;
  holdS: number;
  thighDeg: number;
  shinDeg: number;
  leanDeg: number;
  fps: number;
}

export const SQUAT: SquatShape = Object.freeze({
  seconds: 4,
  downS: 1.25,
  holdS: 1.5,
  thighDeg: 90,
  shinDeg: 5,
  leanDeg: 60,
  fps: 30,
});

const LEG = { thigh: 42, shin: 40, foot: 6 };

const HIERARCHY = `HIERARCHY
ROOT Hips
{
  OFFSET 0 0 0
  CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation
  JOINT LeftUpLeg
  {
    OFFSET 10 0 0
    CHANNELS 3 Zrotation Xrotation Yrotation
    JOINT LeftLeg
    {
      OFFSET 0 -${LEG.thigh} 0
      CHANNELS 3 Zrotation Xrotation Yrotation
      JOINT LeftFoot
      {
        OFFSET 0 -${LEG.shin} 0
        CHANNELS 3 Zrotation Xrotation Yrotation
        JOINT LeftToeBase
        {
          OFFSET 0 -${LEG.foot} 10
          CHANNELS 3 Zrotation Xrotation Yrotation
          End Site
          {
            OFFSET 0 0 4
          }
        }
      }
    }
  }
  JOINT RightUpLeg
  {
    OFFSET -10 0 0
    CHANNELS 3 Zrotation Xrotation Yrotation
    JOINT RightLeg
    {
      OFFSET 0 -${LEG.thigh} 0
      CHANNELS 3 Zrotation Xrotation Yrotation
      JOINT RightFoot
      {
        OFFSET 0 -${LEG.shin} 0
        CHANNELS 3 Zrotation Xrotation Yrotation
        JOINT RightToeBase
        {
          OFFSET 0 -${LEG.foot} 10
          CHANNELS 3 Zrotation Xrotation Yrotation
          End Site
          {
            OFFSET 0 0 4
          }
        }
      }
    }
  }
  JOINT Spine
  {
    OFFSET 0 12 0
    CHANNELS 3 Zrotation Xrotation Yrotation
    JOINT RightArm
    {
      OFFSET -18 30 0
      CHANNELS 3 Zrotation Xrotation Yrotation
      JOINT RightForeArm
      {
        OFFSET 0 -28 0
        CHANNELS 3 Zrotation Xrotation Yrotation
        JOINT RightHand
        {
          OFFSET 0 -25 0
          CHANNELS 3 Zrotation Xrotation Yrotation
          End Site
          {
            OFFSET 0 -8 0
          }
        }
      }
    }
  }
}
`;

const D2R = Math.PI / 180;
const fixed = (v: number) => (Math.abs(v) < 5e-4 ? 0 : v).toFixed(3);

function squatDepth(shape: SquatShape, t: number): number {
  const up = Math.max(0, t - shape.downS - shape.holdS);
  const along = Math.min(t, shape.downS) - Math.min(up, shape.downS);

  return (1 - Math.cos((Math.PI * along) / shape.downS)) / 2;
}

function frame(shape: SquatShape, t: number): number[] {
  const depth = squatDepth(shape, t);
  const thigh = shape.thighDeg * depth;
  const shin = shape.shinDeg * depth;
  const height = LEG.foot + LEG.thigh * Math.cos(thigh * D2R) + LEG.shin * Math.cos(shin * D2R);
  const back = LEG.shin * Math.sin(shin * D2R) - LEG.thigh * Math.sin(thigh * D2R);
  const wave = 30 * Math.sin(2 * Math.PI * t);
  const leg = [0, -thigh, 0, 0, thigh + shin, 0, 0, -shin, 0, 0, 0, 0];
  const arm = [-150, 0, 0, wave, 0, 0, 0, 0, 0];

  return [0, height, back, 0, 0, 0, ...leg, ...leg, 0, shape.leanDeg * depth, 0, ...arm];
}

export function squatWaveBvh(shape: SquatShape = SQUAT): string {
  const count = Math.round(shape.seconds * shape.fps) + 1;
  const lines = Array.from({ length: count }, (_, k) =>
    frame(shape, k / shape.fps)
      .map(fixed)
      .join(' '),
  );

  return `${HIERARCHY}MOTION\nFrames: ${count}\nFrame Time: ${(1 / shape.fps).toFixed(6)}\n${lines.join('\n')}\n`;
}

export const BIPED_LEGS: Partial<Record<Keypoint, string>> = {
  leftHip: 'l_pitch',
  leftKnee: 'l_bend',
  leftAnkle: 'l_tilt',
  rightHip: 'r_pitch',
  rightKnee: 'r_bend',
  rightAnkle: 'r_tilt',
};

export function restPointOf(rig: Rig, robot: Pick<FixtureRobot, 'parts'>): PointOf {
  return (id, where) => {
    const ids = goalParts(rig, id);
    const box = new THREE.Box3();

    for (const p of robot.parts.filter((q) => ids.includes(q.id))) {
      const half = new THREE.Vector3(p.dimensions.width, p.dimensions.height, p.dimensions.depth).multiplyScalar(0.5);
      const at = new THREE.Vector3(...p.position);

      box.union(new THREE.Box3(at.clone().sub(half), at.clone().add(half)));
    }

    if (box.isEmpty()) return null;

    const c = box.getCenter(new THREE.Vector3());

    return where === 'bottom' ? [c.x, box.min.y, c.z] : [c.x, c.y, c.z];
  };
}

export function retargetedMove(options: {
  robot: Pick<FixtureRobot, 'parts' | 'joints'>;
  bvh: string;
  name: string;
  joints: Partial<Record<Keypoint, string>>;
}): RobotAnimation {
  const { robot, bvh, name, joints } = options;
  const rig = buildRig(robot.joints, robot.parts);
  const result = retarget(parseBvh(bvh, name), rig, restPointOf(rig, robot), { joints, name });

  if (typeof result === 'string') throw new Error(result);

  return { ...result.animation, id: name.toLowerCase().replace(/\s+/g, '-') };
}
