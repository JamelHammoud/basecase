import type { MotionClip } from '../utils/motionClip';
import { designFromMotion, type MotionDesignResult } from '../utils/motionDesign';
import type { MotionRequest } from '../utils/motionSkeleton';
import { reply } from '../utils/workerRpc';

export interface MotionDesignCall {
  clip: MotionClip;
  request: MotionRequest;
}

export const motionDesignHandlers = {
  design: ({ clip, request }: MotionDesignCall) => reply<MotionDesignResult>(designFromMotion(clip, request)),
};
