import type { Case } from '../cases/schema';
import type { SimModel } from '../sim/mjcfTypes';
import { hashOf, sha256Hex } from '../skills/hash';
import { triesJob } from '../skills/triesTraining';
import { canTrain } from './demos';
import { readSnapshotRecording, sampleRecording } from './snapshotRecording';
import type { DatasetSnapshot, FrozenTrySample } from './snapshotTypes';

export interface FrozenContent {
  hash: string;
  bytes: Uint8Array;
}

export function snapshotTraining(input: {
  model: SimModel;
  kase: Case;
  contents: FrozenContent[];
  samples: FrozenTrySample[];
  snapshot: DatasetSnapshot;
  revision: string;
}) {
  if (hashOf(input.snapshot) !== input.revision || input.snapshot.modelHash !== sha256Hex(input.model.xml))
    throw new Error('The saved dataset samples changed.');

  const frozen = new Set(input.snapshot.samples.map(hashOf));

  if (input.samples.some((sample) => sample.excluded.length || !frozen.has(hashOf(sample))))
    throw new Error('Choose fitting samples from the frozen dataset.');

  const recordings = new Map(
    input.contents.map(({ hash, bytes }) => {
      if (sha256Hex(bytes) !== hash) throw new Error('The dataset recording content changed.');

      return [hash, readSnapshotRecording(bytes)];
    }),
  );
  const sources = input.samples.map((sample) => {
    const source = recordings.get(sample.recording);

    if (!source) throw new Error('The dataset is missing frozen recording content.');

    return source;
  });
  const controlDt = sources.find((_, index) => input.samples[index].target === 'correction')?.teaching?.controlDt;
  const selected = sources.map((source, index) => {
    const sample = input.samples[index];

    if (sample.target === 'correction') return source;

    const recording = sampleRecording(source, sample);

    if (!canTrain(recording, input.model, controlDt)) throw new Error('These saved samples don’t fit this robot.');

    return recording;
  });

  return triesJob(input.model, input.kase, selected, {
    splits: input.samples.map((sample) => sample.split),
    samples: input.samples,
    revision: input.revision,
  });
}
