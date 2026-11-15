import { reply } from '../utils/workerRpc';
import { designMotion, type MotionDesignRequest } from './motionDesign';

export const motionSkeletonHandlers = {
  design: (request: MotionDesignRequest) => reply(designMotion(request)),
};
