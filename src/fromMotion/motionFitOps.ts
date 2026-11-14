import { errorMessage } from '../utils/errorMessage';
import { parseBvh, type Mocap } from '../utils/mocap';
import { fitMotion, TOLERANCE_SHARE, type MotionSkeleton } from '../utils/motionSkeleton';
import { reply } from '../utils/workerRpc';

export interface MotionFitRequest {
  text: string;
  name: string;
  heightMm: number;
  toleranceMm?: number;
  limbs?: string[];
}

function readBvh(text: string, name: string): Mocap | string {
  try {
    return parseBvh(text, name);
  } catch (err) {
    return `Couldn’t read ${name}. ${errorMessage(err)}`;
  }
}

export function fitBvh({ text, name, heightMm, toleranceMm, limbs }: MotionFitRequest): MotionSkeleton {
  const mocap = readBvh(text, name);

  if (typeof mocap === 'string') return { problem: mocap };

  return fitMotion({ mocap, heightMm, toleranceMm: toleranceMm ?? heightMm * TOLERANCE_SHARE, limbs });
}

export const motionFitHandlers = {
  fit: (request: MotionFitRequest) => reply<MotionSkeleton>(fitBvh(request)),
};
