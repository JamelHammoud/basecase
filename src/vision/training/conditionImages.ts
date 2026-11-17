import { datasetContentHash } from '../../datasets/contentHash';
import type { FrozenImageSample } from '../../datasets/snapshotImages';
import { unpackImageSnapshot } from '../imageSnapshot';
import type { FrameSet } from '../frameSet';
import type { TrainingEvaluation } from './types';
import type { loadDatasetContent } from '../../datasets/datasetStore/content';
import { sampleKey } from './evaluationIdentity';

export async function conditionImages(
  samples: FrozenImageSample[],
  context: {
    candidate: TrainingEvaluation;
    load: typeof loadDatasetContent;
    signal?: AbortSignal;
  },
) {
  const { candidate, load, signal } = context;

  const sets: FrameSet[] = [];
  const dimensions = new Map(candidate.evidence!.frames.map((frame) => [sampleKey(frame.sample), frame.prediction]));
  let archiveBytes = 0;
  const budget = { remaining: 64 * 1024 * 1024 };

  for (const sample of samples) {
    signal?.throwIfAborted();

    const bytes = await load(sample.content);

    signal?.throwIfAborted();

    archiveBytes += bytes?.byteLength ?? 0;

    if (archiveBytes > 64 * 1024 * 1024) throw new Error('Inspect groups with at most 64 MiB of frozen image content.');

    const expected = dimensions.get(sampleKey(sample))!;
    const restored = await restoreConditionImage({ sample, bytes, expected, budget });

    sets.push(restored);
  }

  return mergeConditionImages(sets);
}

function mergeConditionImages(sets: FrameSet[]): FrameSet[] {
  const bySet = new Map<string, FrameSet>();

  for (const set of sets) {
    const previous = bySet.get(set.id);

    if (previous && JSON.stringify(previous.classes) !== JSON.stringify(set.classes))
      throw new Error('The frozen image classes changed.');

    if (previous) previous.frames.push(...set.frames);
    else bySet.set(set.id, set);
  }

  return [...bySet.values()];
}

async function restoreConditionImage({
  sample,
  bytes,
  expected,
  budget,
}: {
  sample: FrozenImageSample;
  bytes: Uint8Array | null;
  expected: { width: number; height: number };
  budget: { remaining: number };
}) {
  if (!bytes || bytes.byteLength > 192_000_000 || (await datasetContentHash(bytes)) !== sample.content)
    throw new Error('The frozen image content changed.');

  const restored = await unpackImageSnapshot(sample, bytes, budget);

  if (restored.frames[0].width !== expected.width || restored.frames[0].height !== expected.height)
    throw new Error('The saved prediction dimensions changed.');

  return restored;
}
