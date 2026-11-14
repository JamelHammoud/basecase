import type { InputRobot } from '../../sim/inputTypes';
import type { FaceFollow, FaceSample } from './faceFollow';
import type { HandFollow, HandSample } from './handFollow';
import type { PoseFollow, PoseSample } from './poseFollow';

export type SkeletonPoint = [x: number, y: number, visible: boolean];

export type Delegate = 'GPU' | 'CPU';

export type LandmarkKind = 'body' | 'hand' | 'face';

export const FEED_FPS = 30;

export type FeedRequest =
  | { type: 'feed'; kind: 'body'; samples: PoseSample[]; fps?: number }
  | { type: 'feed'; kind: 'hand'; samples: HandSample[]; fps?: number }
  | { type: 'feed'; kind: 'face'; samples: FaceSample[]; fps?: number };

export type PoseRequest =
  | { type: 'open'; frames?: ReadableStream<VideoFrame> }
  | { type: 'join'; kind: LandmarkKind; robot: InputRobot; standIn?: boolean }
  | { type: 'leave'; kind: LandmarkKind }
  | { type: 'frame'; bitmap: ImageBitmap }
  | FeedRequest
  | { type: 'close' };

export type FollowEvent =
  | { type: 'pose'; follow: PoseFollow | null; image: SkeletonPoint[] | null; seenAt: number }
  | { type: 'hand'; follow: HandFollow | null; seenAt: number }
  | { type: 'face'; follow: FaceFollow | null; seenAt: number };

export type PoseEvent =
  | FollowEvent
  | { type: 'ready'; kind: LandmarkKind; delegate: Delegate }
  | { type: 'error'; kind?: LandmarkKind; message: string };

export const wallClock = () => performance.timeOrigin + performance.now();
