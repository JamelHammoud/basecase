import type { CaseMat } from '../../cases/mat/matLayout';
import type { MatCamera } from './matFrames';
import type { BaseFix } from './matSolve';
import type { MatSample } from './matTracker';

export interface FeedPose {
  t: number;
  base: BaseFix | null;
}

export interface MatFeed {
  camera: MatCamera;
  width: number;
  height: number;
  fps?: number;
  poses: FeedPose[];
}

export const FEED_FPS = 30;

export type TagsRequest =
  | { type: 'open'; mat: CaseMat; frames?: ReadableStream<VideoFrame>; standIn?: boolean }
  | { type: 'frame'; bitmap: ImageBitmap }
  | { type: 'feed'; feed: MatFeed }
  | { type: 'close' };

export type TagsEvent =
  | { type: 'ready' }
  | { type: 'sample'; sample: MatSample }
  | { type: 'refused'; message: string }
  | { type: 'error'; message: string };
