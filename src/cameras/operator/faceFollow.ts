import type { InputLook, InputRobot } from '../../sim/inputTypes';
import type { JointValues } from '../../types/robotics';
import { bearingOf, type ImageOffset } from './laptopLens';
import { createOneEuro } from './oneEuro';
import type { PoseLandmark } from './poseLandmarks';

export const FACE = { top: 10, chin: 152, rightCheek: 234, leftCheek: 454 } as const;

export const FACE_LANDMARK_COUNT = 478;

export interface FaceSample {
  t: number;
  image: PoseLandmark[];
  matrix: number[];
}

export interface FaceFollow {
  offset: ImageOffset;
  bearing: [right: number, up: number];
  yaw: number;
  pitch: number;
  joints?: JointValues;
}

export interface FaceFollower {
  step: (sample: FaceSample) => FaceFollow | null;
}

const DEG = Math.PI / 180;
const MATRIX_SIZE = 16;

const finite = (p: PoseLandmark | undefined): p is PoseLandmark => !!p && Number.isFinite(p.x + p.y);

export function faceOffset(image: PoseLandmark[]): ImageOffset | null {
  const top = image[FACE.top];
  const chin = image[FACE.chin];
  const right = image[FACE.rightCheek];
  const left = image[FACE.leftCheek];

  if (!finite(top) || !finite(chin) || !finite(right) || !finite(left)) return null;

  return [(right.x + left.x) / 2 - 0.5, (top.y + chin.y) / 2 - 0.5];
}

export function headTurn(matrix: number[]): { yaw: number; pitch: number } {
  const [x, y, z] = [matrix[8], matrix[9], matrix[10]];
  const across = Math.hypot(x, z);

  if (matrix.length < MATRIX_SIZE || !Number.isFinite(x + y + z) || across + Math.abs(y) < 1e-6)
    return { yaw: 0, pitch: 0 };

  return { yaw: Math.atan2(x, z) / DEG, pitch: Math.atan2(y, across) / DEG };
}

export function lookTargets(bearing: FaceFollow['bearing'], look: InputLook): JointValues {
  const pan = { [look.pan]: look.panSign * bearing[0] };

  return look.tilt ? { ...pan, [look.tilt]: look.tiltSign * bearing[1] } : pan;
}

export function createFaceFollower(robot: InputRobot): FaceFollower {
  const [x, y, yaw, pitch] = [createOneEuro(), createOneEuro(), createOneEuro(), createOneEuro()];
  const look = robot.kind === 'joints' ? robot.look : undefined;

  return {
    step: (sample) => {
      const seen = faceOffset(sample.image);

      if (!seen) return null;

      const tSeconds = sample.t / 1000;
      const offset: ImageOffset = [x(seen[0], tSeconds), y(seen[1], tSeconds)];
      const bearing = bearingOf(offset);
      const turn = headTurn(sample.matrix);
      const follow: FaceFollow = {
        offset,
        bearing,
        yaw: yaw(turn.yaw, tSeconds),
        pitch: pitch(turn.pitch, tSeconds),
      };

      return look ? { ...follow, joints: lookTargets(bearing, look) } : follow;
    },
  };
}
