import type { SimModel } from '../sim/mjcfTypes';
import type { MeshFiles } from '../three/componentMeshes';
import type { ScenePart } from '../types/robotics';
import type { CameraView } from './views';

export type FeedRequest =
  | { type: 'scene'; parts: ScenePart[]; world: ScenePart[]; meshes: MeshFiles }
  | { type: 'model'; model: SimModel | null }
  | { type: 'views'; views: CameraView[]; sizes: Record<string, [number, number]> }
  | { type: 'port'; port: MessagePort };

export type FeedEvent = { type: 'frame'; bitmaps: Record<string, ImageBitmap>; frames: number };

export const FRAME_MS = 1000 / 60;
