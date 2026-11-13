import type { SimModel } from '../sim/mjcfTypes';
import type { ScenePart } from '../types/robotics';
import { clockTime } from '../utils/duration';
import { encodeBitmap } from '../utils/imageEncode';
import type { FixedCamera } from './fixed';
import { cameraViews, findView, type CameraView } from './views';
import { cameraFeed } from './viewsClient';

export interface ShotFrame {
  t: number;
  poses: Float64Array | null;
}

export interface CameraShotInput {
  parts: ScenePart[];
  world: ScenePart[];
  model: SimModel | null;
  fixed: FixedCamera[];
  names: string[];
  frames: ShotFrame[];
}

export interface CameraShot {
  view: string;
  dataUrl: string;
}

export interface CameraShots {
  shots: CameraShot[];
  missing: string[];
  available: string[];
}

const encode = (bitmap: ImageBitmap) => encodeBitmap({ bitmap, type: 'image/jpeg', quality: 0.85 });

export function pickViews(all: CameraView[], names: string[]): { views: CameraView[]; missing: string[] } {
  const views: CameraView[] = [];
  const missing: string[] = [];

  for (const name of names) {
    const view = findView(all, name);

    if (!view) missing.push(name);
    else if (!views.includes(view)) views.push(view);
  }

  return { views, missing };
}

export const shotLabel = (view: CameraView, t: number | null) =>
  t === null ? view.label : `${view.label} at ${clockTime(t)}`;

export async function cameraShots(input: CameraShotInput): Promise<CameraShots> {
  const solid = input.parts.filter((p) => p.visible && p.role === 'solid');
  const all = cameraViews(solid, input.world, input.fixed);
  const { views, missing } = pickViews(all, input.names);
  const available = all.map((v) => v.label);

  if (!views.length) return { shots: [], missing, available };

  const feed = cameraFeed();
  const keys = views.map((v) => v.key);
  const timed = input.frames.length > 1 || input.frames.some((f) => f.poses);
  const shots: CameraShot[] = [];

  try {
    await feed.load({ parts: solid, world: input.world, model: input.model, views });

    for (const frame of input.frames) {
      const bitmaps = await feed.frame({ poses: frame.poses?.slice() ?? null, keys });
      const taken = views.filter((v) => bitmaps[v.key]);

      shots.push(
        ...(await Promise.all(
          taken.map(async (v) => ({
            view: shotLabel(v, timed ? frame.t : null),
            dataUrl: await encode(bitmaps[v.key]),
          })),
        )),
      );
    }
  } finally {
    feed.dispose();
  }

  return { shots, missing, available };
}
