import { splitOf } from '../datasets/datasetSplit';
import type { FrameSet } from './frameSet';

export function imageSplit(set: Pick<FrameSet, 'seed' | 'frames' | 'splits'>) {
  if (set.splits) {
    return {
      train: set.frames.filter((frame) => set.splits?.[frame.id] === 'train').map((frame) => frame.id),
      validation: set.frames.filter((frame) => set.splits?.[frame.id] === 'validation').map((frame) => frame.id),
      test: set.frames.filter((frame) => set.splits?.[frame.id] === 'test').map((frame) => frame.id),
    };
  }

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
