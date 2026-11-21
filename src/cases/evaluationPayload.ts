import { gzipSync, gunzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { keepTyped, restoreTyped } from './recordingValues';
import type { EvaluationReplay } from './evaluationReplayValidation';

export const MAX_EVALUATION_PAYLOAD = 64 * 1024 * 1024;

export function encodeEvaluationPayload(source: EvaluationReplay): Uint8Array {
  const bytes = new TextEncoder().encode(JSON.stringify(source, keepTyped));

  if (bytes.length > MAX_EVALUATION_PAYLOAD) throw new Error('Evaluation recording exceeds its limits.');

  return gzipSync(bytes, { level: 1, mtime: 0 });
}

export function decodeEvaluationPayload(bytes: Uint8Array): unknown {
  if (bytes.length < 18) throw new Error('Evaluation recording can’t be read.');

  const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(bytes.length - 4, true);

  if (size > MAX_EVALUATION_PAYLOAD) throw new Error('Evaluation recording exceeds its limits.');

  const raw = gunzipSync(bytes, { out: new Uint8Array(size) });

  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw), restoreTyped);
}
