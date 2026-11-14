import { splitOf } from '../datasets/datasetSplit';
import type { FrameSet } from './frameSet';

export function imageSplit(set: Pick<FrameSet, 'seed' | 'frames'>) {
  const first = splitOf(
    set.frames.map((f) => f.id),
    set.seed,
  );
  const held = splitOf(first.validation, set.seed);

  return { train: first.train, validation: held.train, test: held.validation };
}

export const IMAGE_SPLITS = ['train', 'validation', 'test'] as const;
export type ImageSplit = (typeof IMAGE_SPLITS)[number];
export const splitFolder = (split: ImageSplit) => (split === 'validation' ? 'val' : split);
