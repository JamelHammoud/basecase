import { evaluateImageGroup, type ImageGroup } from './conditionEvaluation';
import type { TrainingEvaluation } from './types';

export interface ConditionGroupInput {
  candidate: TrainingEvaluation;
  incumbent: TrainingEvaluation;
  group: ImageGroup;
  port: MessagePort;
}

export async function conditionGroupJob(input: ConditionGroupInput) {
  const controller = new AbortController();
  let pending: { resolve: (bytes: Uint8Array | null) => void; reject: (error: Error) => void } | null = null;

  input.port.onmessage = ({ data }: MessageEvent<{ cancel?: boolean; bytes?: Uint8Array | null; error?: string }>) => {
    if (data.cancel) {
      controller.abort();
      pending?.reject(new DOMException('Aborted', 'AbortError'));
      pending = null;

      return;
    }

    if (data.error) pending?.reject(new Error(data.error));
    else pending?.resolve(data.bytes ?? null);

    pending = null;
  };

  const load = (content: string) =>
    new Promise<Uint8Array | null>((resolve, reject) => {
      controller.signal.throwIfAborted();
      pending = { resolve, reject };
      input.port.postMessage({ content });
    });

  try {
    return await evaluateImageGroup(input, load, controller.signal);
  } finally {
    input.port.close();
  }
}
