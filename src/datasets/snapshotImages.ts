import type { ImageMembers } from './datasetFile';
import { loadDatasetContent, saveDatasetContent } from './datasetStore/content';
import type { FrameSet } from '../vision/frameSet';
import { loadFrameSet } from '../vision/frameSetStore';
import { imageDatasetWorker } from '../vision/imageDatasetWorker';
import type { ImageSplit } from '../vision/imageSplit';

export interface FrozenImageSample {
  frameSetId: string;
  frameId: string;
  source: string;
  hash: string;
  content: string;
  split: ImageSplit;
  explicit?: ImageSplit;
}

export async function freezeImages(
  members: ImageMembers[],
  load: (id: string) => Promise<FrameSet | null> = loadFrameSet,
  save: (bytes: Uint8Array) => Promise<string> = saveDatasetContent,
): Promise<FrozenImageSample[]> {
  const samples: FrozenImageSample[] = [];

  for (const member of members) {
    const set = await load(member.frameSetId);

    if (!set) throw new Error('The dataset is missing its images.');

    const packed = await imageDatasetWorker.call('packSnapshots', { set, member });

    for (const { sample, bytes } of packed) samples.push({ ...sample, content: await save(bytes) });
  }

  return samples;
}

export async function restoreImages(
  samples: FrozenImageSample[],
  load: (hash: string) => Promise<Uint8Array | null> = loadDatasetContent,
): Promise<FrameSet[]> {
  const sets = new Map<string, { set: FrameSet; classes: string }>();

  for (const sample of samples) {
    const bytes = await frozenContent(sample, load);
    const set = await imageDatasetWorker.call('unpackSnapshot', { sample, bytes });
    const previous = sets.get(set.id);
    const classes = JSON.stringify(set.classes);

    if (previous && previous.classes !== classes) throw new Error('The frozen image classes changed.');

    if (previous) {
      previous.set.frames.push(...set.frames);
      Object.assign(previous.set.splits!, set.splits);

      continue;
    }

    sets.set(set.id, { set, classes });
  }

  return [...sets.values()].map(({ set }) => set);
}

async function frozenContent(sample: FrozenImageSample, load: (hash: string) => Promise<Uint8Array | null>) {
  const bytes = await load(sample.content);

  if (!bytes) throw new Error('The dataset is missing frozen image content.');

  return bytes;
}

export async function frozenImageJpeg(
  sample: FrozenImageSample,
  load: (hash: string) => Promise<Uint8Array | null> = loadDatasetContent,
): Promise<Uint8Array> {
  const bytes = await frozenContent(sample, load);

  return imageDatasetWorker.call('snapshotJpeg', { sample, bytes });
}
