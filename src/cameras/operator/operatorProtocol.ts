import type { DriveCommand } from '../../sim/driveTypes';
import type { LandmarkRow } from './landmarks';
import type { OperatorTarget } from './operatorDriver';

export type OperatorRequest =
  | { type: 'start'; target: OperatorTarget; frames?: ReadableStream<VideoFrame>; estimate: boolean }
  | { type: 'frame'; bitmap: ImageBitmap }
  | { type: 'canvas'; canvas: OffscreenCanvas; mirror: boolean }
  | { type: 'landmarks'; frames: LandmarkRow[][]; fps: number }
  | { type: 'stop' };

export type OperatorResponse =
  | { type: 'command'; command: DriveCommand; at: number }
  | { type: 'estimator'; ready: boolean; message?: string }
  | { type: 'timing'; detectMs: number; fps: number };
