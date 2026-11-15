import type { StoredTry } from '../cases/tryFile';
import type { VisionAssignment } from './visionFrames';

export type RecordedCameraRequest =
  | { type: 'open'; stored: StoredTry }
  | { type: 'seek'; seconds: number; timestamp: number }
  | { type: 'vision'; port: MessagePort }
  | { type: 'assignments'; assignments: VisionAssignment[] }
  | { type: 'stream'; id: number; camera: string; width: number; height: number; fps: number }
  | { type: 'unstream'; id: number }
  | { type: 'refresh' }
  | { type: 'close' };

export type RecordedCameraEvent =
  | { type: 'frame'; camera: string; bitmap: ImageBitmap; timestamp: number }
  | { type: 'stream'; id: number; bitmap: ImageBitmap; timestamp: number }
  | { type: 'error'; camera: string; message: string };

export const recordedVideoUrl = (id: string, camera: string) =>
  `/api/tries/video/${encodeURIComponent(id)}/${encodeURIComponent(camera)}`;
