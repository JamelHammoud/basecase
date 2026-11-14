import type { FrameMessage } from '../cameras/operator/operatorFrames';

export type TakeVideoRequest =
  { type: 'open'; frames?: ReadableStream<VideoFrame> } | FrameMessage | { type: 'finish' };

export interface TakeVideoReply {
  type: 'done';
  bytes: Uint8Array | null;
}

export interface VideoRecorder {
  finish: () => Promise<Uint8Array | null>;
  drop: () => void;
}
