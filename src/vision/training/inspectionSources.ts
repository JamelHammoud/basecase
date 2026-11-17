import { loadRecordingBytes } from '../../cases/tryStore';
import { evaluationWorker } from './evaluationWorker';
import type { PreparationSource } from './prepareSources';
import type { FrozenImageSample } from '../../datasets/snapshotImages';
import type { StoredTry } from '../../cases/tryFile';
import type { InspectionSourceIdentity } from './inspectionSource';

export async function captureInspectionSource(stored: StoredTry): Promise<InspectionSourceIdentity | null> {
  try {
    const bytes = await loadRecordingBytes(stored.id);

    if (!bytes) return null;

    return await evaluationWorker.call('sourceIdentity', { bytes, stored }, [bytes.buffer]);
  } catch {
    return null;
  }
}

export async function captureInspectionSources(input: {
  sources: PreparationSource[];
  samples: FrozenImageSample[];
  realSourceIds: string[];
  capture?: typeof captureInspectionSource;
}) {
  const test = new Set(
    input.samples
      .filter((sample) => sample.split === 'test' && input.realSourceIds.includes(sample.source))
      .map((sample) => sample.source),
  );
  const sources: PreparationSource[] = [];

  for (const source of input.sources) {
    const stored = source.manifests[0];
    const identity = stored && test.has(source.source) && input.capture ? await input.capture(stored) : null;

    sources.push({ ...source, ...(identity ? { inspection: identity } : {}) });
  }

  return sources;
}
