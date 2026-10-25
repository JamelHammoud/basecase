import type { ScenePart } from '../types/robotics';
import { solidSizeMm } from '../utils/sceneSize';
import { renderPartGroups, thumbnailParts } from './partThumbnails';

export interface ScenePreviewFields {
  previewDataUrl?: string;
  sizeMm?: [number, number, number];
}

export async function scenePreview(parts: ScenePart[]): Promise<ScenePreviewFields> {
  const shown = thumbnailParts(parts);
  const sizeMm = solidSizeMm(parts) ?? undefined;

  if (!shown.length) {
    return { sizeMm };
  }

  try {
    return { previewDataUrl: await renderPartGroups(shown, { tightness: 1.0, mime: 'image/webp' }), sizeMm };
  } catch {
    return { sizeMm };
  }
}
