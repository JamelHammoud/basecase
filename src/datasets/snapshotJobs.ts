import type { SimModel } from '../sim/mjcfTypes';
import { recordingTransfer } from '../sim/recorder';
import { canonicalJson } from '../skills/hash';
import { sha256 } from '../cases/tries';
import { reply } from '../utils/workerRpc';
import { datasetContentHash } from './contentHash';
import { canExport } from './episodes';
import { readSnapshotRecording, sampleRecording } from './snapshotRecording';
import type { DatasetSnapshot, FrozenTrySample } from './snapshotTypes';

interface InspectInput {
  bytes: Uint8Array;
  model: SimModel;
}

interface RestoreInput {
  bytes: Uint8Array;
  samples: FrozenTrySample[];
}

export const snapshotJobs = {
  inspect: ({ bytes, model }: InspectInput) => {
    const recording = readSnapshotRecording(bytes);

    return reply({ frames: recording.frames, exportable: canExport(recording, model) });
  },
  restoreGroup: async ({ bytes, samples }: RestoreInput) => {
    const hash = await datasetContentHash(bytes);

    if (samples.some((sample) => sample.recording !== hash)) throw new Error('The dataset recording content changed.');

    const source = readSnapshotRecording(bytes);
    const recordings = samples.map((sample) => sampleRecording(source, sample));

    return reply(recordings, [...new Set(recordings.flatMap(recordingTransfer))]);
  },
  hash: async (snapshot: DatasetSnapshot) => reply(await sha256(canonicalJson(snapshot))),
  encodeJson: (value: unknown) => {
    const bytes = new TextEncoder().encode(canonicalJson(value));

    return reply(bytes, [bytes.buffer]);
  },
  decodeJson: (bytes: Uint8Array) => reply(JSON.parse(new TextDecoder().decode(bytes)) as unknown),
};
