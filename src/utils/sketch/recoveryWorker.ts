import type { ScenePart } from '../../types/robotics';
import { recoveryInput, validateRecoveryEntry } from './recoverySource';
import type { recoverImportedSketch } from './importRecovery';

export type RecoveryResult = ReturnType<typeof recoverImportedSketch>;

export function recoverImportAsync(part: ScenePart, signal: AbortSignal): Promise<RecoveryResult> {
  if (signal.aborted) return Promise.reject(new DOMException('Cancelled', 'AbortError'));

  validateRecoveryEntry(part);

  const worker = new Worker(new URL('./recovery.worker.ts', import.meta.url), { type: 'module' });

  return new Promise((resolve, reject) => {
    const dispose = () => {
      worker.terminate();
      signal.removeEventListener('abort', abort);
    };
    const abort = () => {
      dispose();
      reject(new DOMException('Cancelled', 'AbortError'));
    };

    worker.onmessage = ({ data }: MessageEvent<{ result?: RecoveryResult; error?: string }>) => {
      dispose();

      if (data.result) resolve({ ...data.result, part: recoveredRecord(part, data.result.part) });
      else reject(new Error(data.error));
    };
    worker.onerror = (event) => {
      dispose();
      reject(new Error(event.message));
    };
    signal.addEventListener('abort', abort, { once: true });

    try {
      worker.postMessage(recoveryInput(part));
    } catch (error) {
      dispose();
      reject(error);
    }
  });
}

function recoveredRecord(source: ScenePart, prepared: ScenePart): ScenePart {
  const record = prepared.sketch!;

  return {
    ...source,
    kind: prepared.kind,
    rotation: prepared.rotation,
    dimensions: { ...source.dimensions, ...prepared.dimensions },
    customNodes: prepared.customNodes,
    sheetTransform: undefined,
    sketch: {
      ...record,
      recovery: {
        ...record.recovery!,
        position: source.position,
        rotation: source.rotation,
        dimensions: source.dimensions,
        sheetTransform: source.sheetTransform,
      },
    },
  };
}
