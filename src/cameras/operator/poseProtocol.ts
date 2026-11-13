import type { InputRobot } from '../../sim/inputTypes';
import type { PoseFollow, PoseSample } from './poseFollow';

export type SkeletonPoint = [x: number, y: number, visible: boolean];

export type Delegate = 'GPU' | 'CPU';

export const FEED_FPS = 30;

export type PoseRequest =
  | { type: 'open'; robot: InputRobot; frames?: ReadableStream<VideoFrame>; standIn?: boolean }
  | { type: 'frame'; bitmap: ImageBitmap }
  | { type: 'feed'; samples: PoseSample[]; fps?: number }
  | { type: 'close' };

export type PoseEvent =
  | { type: 'pose'; follow: PoseFollow | null; image: SkeletonPoint[] | null; seenAt: number }
  | { type: 'ready'; delegate: Delegate }
  | { type: 'error'; message: string };

export const wallClock = () => performance.timeOrigin + performance.now();
