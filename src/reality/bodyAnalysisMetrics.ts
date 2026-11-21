import type { MainModule } from '@mujoco/mujoco';
import { loadedMujoco } from './calibrate';
import { analyzeBody } from './bodyAnalysis';
import type { BodyAnalysisRequest } from './bodyAnalysisTypes';

export interface BodyAnalysisMetrics {
  elapsedMs: number;
  wasmHeapBytes: number;
  replays: number;
}

export async function measuredBodyAnalysis(request: BodyAnalysisRequest) {
  const started = performance.now();
  const outcome = await analyzeBody(request);
  const mj = outcome.replays ? await loadedMujoco() : null;

  return {
    outcome,
    metrics: {
      elapsedMs: performance.now() - started,
      wasmHeapBytes: mj ? wasmHeapBytes(mj) : 0,
      replays: outcome.replays,
    },
  };
}

export function wasmHeapBytes(mj: MainModule): number {
  const probe = new mj.Uint8Buffer(1);

  try {
    return (probe.GetView() as Uint8Array).buffer.byteLength;
  } finally {
    probe.delete();
  }
}
