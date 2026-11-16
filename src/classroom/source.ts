import type { ClassroomDesign } from './designSettings';
import type { BundleSource } from '../gallery/buildBundle';
import { galleryBundleOf } from '../gallery/buildBundle';
import { restoreWorldAssets, type SerializedWorldAssets } from '../cases/worldAssets';

export interface ClassroomSource {
  design?: ClassroomDesign;
  source: Omit<BundleSource, 'triangles'>;
  triangles: Record<string, Float32Array>;
  worldAssets?: string | SerializedWorldAssets;
}

export async function classroomBundle(input: ClassroomSource) {
  await restoreWorldAssets(typeof input.worldAssets === 'string' ? JSON.parse(input.worldAssets) : input.worldAssets);

  return galleryBundleOf({ ...input.source, triangles: (id) => input.triangles[id] ?? null });
}
