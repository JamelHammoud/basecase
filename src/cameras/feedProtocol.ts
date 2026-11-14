import type { SimModel } from '../sim/mjcfTypes';
import type { MeshFiles } from '../three/componentMeshes';
import type { ScenePart } from '../types/robotics';
import type { CameraView } from './views';

export type FeedRequest =
  | { type: 'scene'; parts: ScenePart[]; world: ScenePart[]; meshes: MeshFiles }
  | { type: 'model'; model: SimModel | null }
  | { type: 'views'; views: CameraView[]; sizes: Record<string, [number, number]> }
  | { type: 'port'; port: MessagePort }
  | { type: 'stream'; id: number; key: string; size: [number, number]; fps: number }
  | { type: 'unstream'; id: number };

export type FeedEvent =
  | { type: 'frame'; bitmaps: Record<string, ImageBitmap>; frames: number }
  | { type: 'stream'; id: number; bitmap: ImageBitmap };

export const FRAME_MS = 1000 / 60;
