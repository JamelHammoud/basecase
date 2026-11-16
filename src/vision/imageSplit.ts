import { splitOf } from '../datasets/datasetSplit';
import type { FrameSet } from './frameSet';

function savedSplit(frames: FrameSet['frames'], assignments: NonNullable<FrameSet['splits']>) {
  const split: Record<ImageSplit, string[]> = { train: [], validation: [], test: [] };

  for (const frame of frames) {
    const name = assignments[frame.id];

    if (name === 'train' || name === 'validation' || name === 'test') split[name].push(frame.id);
  }

  return split;
}

export function imageSplit(set: Pick<FrameSet, 'seed' | 'frames' | 'splits'>) {
  if (set.splits) return savedSplit(set.frames, set.splits);

  const first = splitOf(
    set.frames.map((f) => f.id),
    set.seed,
  );
  const held = splitOf(first.validation, set.seed);

  if (set.frames.every((frame) => frame.split === undefined))
    return { train: first.train, validation: held.train, test: held.validation };

  const generated = new Map([
    ...first.train.map((id) => [id, 'train'] as const),
    ...held.train.map((id) => [id, 'validation'] as const),
    ...held.validation.map((id) => [id, 'test'] as const),
  ]);
  const split: Record<ImageSplit, string[]> = { train: [], validation: [], test: [] };

  for (const frame of [...set.frames].sort((a, b) => a.id.localeCompare(b.id))) {
    split[frame.split ?? generated.get(frame.id)!].push(frame.id);
  }

  return split;
}

export const IMAGE_SPLITS = ['train', 'validation', 'test'] as const;
export type ImageSplit = (typeof IMAGE_SPLITS)[number];
export const splitFolder = (split: ImageSplit) => (split === 'validation' ? 'val' : split);
