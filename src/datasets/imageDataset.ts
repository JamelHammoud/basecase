import type { Dataset } from './datasetFile';
import type { FrameSetManifest, VisionFrameSet } from '../vision/frameSet';
import { loadFrameSet, loadFrameSetManifest } from '../vision/frameSetStore';

export async function imageManifestsOf(dataset: Pick<Dataset, 'imageMembers'>): Promise<FrameSetManifest[]> {
  const manifests: FrameSetManifest[] = [];

  for (const member of dataset.imageMembers ?? []) {
    const manifest = await loadFrameSetManifest(member.frameSet);

    if (!manifest || manifest.id !== member.hash) throw new Error('The dataset’s image content is missing or changed.');

    const ids = new Set(manifest.frames);

    if (member.frames.some((id) => !ids.has(id))) throw new Error('The dataset’s image frames are missing.');

    manifests.push({ ...manifest, frames: member.frames });
  }

  return manifests;
}

export async function imageSetsOf(
  dataset: Pick<Dataset, 'imageMembers'>,
  load: (id: string) => Promise<VisionFrameSet | null> = loadFrameSet,
): Promise<VisionFrameSet[]> {
  const sets: VisionFrameSet[] = [];

  for (const member of dataset.imageMembers ?? []) {
    const set = await load(member.frameSet);

    if (!set || set.id !== member.hash) throw new Error('The dataset’s image content is missing or changed.');

    const frames = new Map(set.frames.map((frame) => [frame.id, frame]));
    const selected = member.frames.map((id) => frames.get(id));

    if (selected.some((frame) => !frame)) throw new Error('The dataset’s image frames are missing.');

    sets.push({ ...set, frames: selected.filter((frame) => frame !== undefined) });
  }

  return sets;
}
