import { errorMessage } from '../utils/errorMessage';
import { parseBvh } from '../utils/mocap';
import { motionSkeleton } from '../utils/motionSkeleton';
import { motionServos } from './motionServos';

export interface MotionDesignRequest {
  text: string;
  name?: string;
  heightMm: number;
  toleranceMm: number;
  limbs?: string[];
}

export function designMotion(request: MotionDesignRequest) {
  try {
    const fit = motionSkeleton({ ...request, motion: parseBvh(request.text, request.name) });

    return 'problem' in fit ? fit : motionServos(fit);
  } catch (error) {
    return { problem: `Couldn’t read the BVH: ${errorMessage(error)}` };
  }
}
