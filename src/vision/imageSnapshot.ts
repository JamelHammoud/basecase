import { unzipSync, zipSync } from 'three/examples/jsm/libs/fflate.module.js';
import type { FrozenImageSample } from '../datasets/snapshotImages';
import { frameHash, frameSetHash, type FrameSet, type TrainingFrame } from './frameSet';
import { imagePackage, readImagePackage } from './imagePackage';
import type { ImageMembers } from '../datasets/datasetFile';
import { sourceRun } from '../datasets/snapshotSplits';

const sourceOf = async (set: FrameSet, frame: TrainingFrame) =>
  frame.source === 'import'
    ? `image:${await frameHash({ ...frame, split: undefined })}`
    : sourceRun(set.sceneId, set.caseId, frame.seed);

export async function packImageSnapshots(set: FrameSet, member: ImageMembers) {
  if (set.id !== member.frameSetId || (await frameSetHash(set)) !== member.hash)
    throw new Error('The image dataset content changed.');

  const byId = new Map(set.frames.map((frame) => [frame.id, frame]));
  const packed = [];

  for (const id of member.frameIds) {
    const frame = byId.get(id);

    if (!frame) throw new Error('The dataset is missing an image.');

    const selected = { ...set, frames: [frame], splits: undefined };
    const bytes = zipSync(imagePackage(selected), { level: 0, mtime: new Date(1980, 0, 1) });
    const explicit = set.splits?.[frame.id] ?? frame.split;
    const sample = {
      frameSetId: set.id,
      frameId: frame.id,
      source: await sourceOf(set, frame),
      hash: await frameHash(frame),
      split: explicit ?? ('train' as const),
      ...(explicit ? { explicit } : {}),
    };

    packed.push({ sample, bytes });
  }

  return packed;
}

export async function unpackImageSnapshot(sample: FrozenImageSample, bytes: Uint8Array): Promise<FrameSet> {
  let size = 0;
  let count = 0;
  const files = unzipSync(bytes, {
    filter: (entry) => {
      size += entry.originalSize;
      count++;

      if (size > 192_000_000 || count > 3) throw new Error('The frozen image content exceeds its size limit.');

      if (entry.compression === 0 && entry.size !== entry.originalSize)
        throw new Error('The frozen image content changed.');

      return true;
    },
  });
  const set = readImagePackage(files);
  const frame = set.frames[0];

  if (
    set.id !== sample.frameSetId ||
    set.frames.length !== 1 ||
    frame.id !== sample.frameId ||
    (await frameHash(frame)) !== sample.hash ||
    (await sourceOf(set, frame)) !== sample.source
  )
    throw new Error('The frozen image content changed.');

  return { ...set, splits: { [frame.id]: sample.split } };
}
