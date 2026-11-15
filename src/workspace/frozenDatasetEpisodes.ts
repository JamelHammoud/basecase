import type { DatasetJobEpisode } from '../datasets/buildDataset';
import { restoreSamples } from '../datasets/datasetSnapshot';
import type { DatasetSnapshot, FrozenTrySample } from '../datasets/snapshotTypes';
import type { DatasetSegment } from '../datasets/episodes';

const SPLIT_ORDER = { train: 0, validation: 1, test: 2 };

function taskOf(sample: FrozenTrySample, segments: DatasetSegment[], task: string) {
  const cropped = sample.from !== 0 || sample.to !== sample.stored.frames;
  const segment = segments.length === 1 ? segments[0] : null;

  if (cropped && segment?.from === 0 && segment.to === sample.to - sample.from) return segment.text;

  return sample.stored.labels?.instruction?.trim() || task;
}

function sourceOf(sample: FrozenTrySample) {
  const stored = sample.stored;

  return {
    try: sample.tryId,
    at: stored.startedAt,
    margin: stored.outcome.margin,
    case_hash: stored.case?.hash ?? null,
    seed: stored.seed,
    source: stored.sourceTry,
    recording_hash: sample.recording,
    source_run: sample.source,
    from_frame: sample.from,
    to_frame: sample.to,
  };
}

export async function frozenDatasetEpisodes(snapshot: DatasetSnapshot): Promise<DatasetJobEpisode[]> {
  const restored = await restoreSamples(snapshot);

  return restored
    .map(({ sample, recording, segments }) => ({
      recording,
      task: taskOf(sample, segments, snapshot.task),
      ...(segments.length ? { segments } : {}),
      source: sourceOf(sample),
      split: sample.split,
    }))
    .sort((a, b) => SPLIT_ORDER[a.split] - SPLIT_ORDER[b.split]);
}
