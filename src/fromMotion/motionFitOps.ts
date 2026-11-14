import { readBvh } from '../utils/mocap';
import { fitMotion, TOLERANCE_SHARE, type MotionSkeleton } from '../utils/motionSkeleton';
import { reply } from '../utils/workerRpc';

export interface MotionFitRequest {
  text: string;
  name: string;
  heightMm: number;
  toleranceMm?: number;
  limbs?: string[];
}

export function fitBvh({ text, name, heightMm, toleranceMm, limbs }: MotionFitRequest): MotionSkeleton {
  const mocap = readBvh(text, name);

  if (typeof mocap === 'string') return { problem: mocap };

  return fitMotion({ mocap, heightMm, toleranceMm: toleranceMm ?? heightMm * TOLERANCE_SHARE, limbs });
}

export const motionFitHandlers = {
  fit: (request: MotionFitRequest) => reply<MotionSkeleton>(fitBvh(request)),
};
