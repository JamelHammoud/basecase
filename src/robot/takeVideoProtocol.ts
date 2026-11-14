import type { FrameMessage } from '../cameras/operator/operatorFrames';

export type TakeVideoRequest =
  { type: 'open'; frames?: ReadableStream<VideoFrame>; lead: number } | FrameMessage | { type: 'finish' };

export type TakeVideoReply =
  { type: 'chunk'; position: number; data: Uint8Array<ArrayBuffer> } | { type: 'done'; ok: boolean };

export interface VideoRecorder {
  finish: () => Promise<boolean>;
  drop: () => Promise<void>;
}
