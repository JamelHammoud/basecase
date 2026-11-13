import { sha256, type TryRecord } from '../cases/tries';
import { loadRecording } from '../cases/tryStore';
import type { SimModel } from '../sim/mjcfTypes';
import type { Recording } from '../sim/recorder';
import { canExport } from './episodes';

export interface UsableTry {
  record: TryRecord;
  recording: Recording;
}

interface UsableOptions {
  accepts?: (recording: Recording, model: SimModel) => boolean;
  load?: (id: string) => Promise<Recording | null | undefined>;
}

export async function usableTries(tries: TryRecord[], model: SimModel, options: UsableOptions = {}) {
  const { accepts = canExport, load = loadRecording } = options;
  const modelHash = await sha256(model.xml);
  const usable: UsableTry[] = [];

  for (const record of tries) {
    const fits = record.passed && record.manifest.modelHash === modelHash;
    const recording = fits ? await load(record.id) : null;

    if (recording && accepts(recording, model)) usable.push({ record, recording });
  }

  return { usable, modelHash };
}
