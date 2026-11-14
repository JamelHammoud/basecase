import type { TrySource, TryVideo } from '../../cases/tryFile';

export type RecordedVideoRequest =
  | { type: 'open'; id: string; video: TryVideo; source: TrySource; canvas: OffscreenCanvas }
  | { type: 'seek'; time: number }
  | { type: 'vision'; port: MessagePort; cameras: string[] };

export type RecordedVideoReply =
  { type: 'error'; message: string } | { type: 'frame'; time: number; timestamp: number };
