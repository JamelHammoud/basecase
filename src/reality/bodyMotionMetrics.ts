import { loadedMujoco } from './calibrate';
import { wasmHeapBytes } from './bodyAnalysisMetrics';
import { recommendBodyMotion } from './bodyMotion';
import type { BodyMotionRequest } from './bodyMotionTypes';

export async function measuredBodyMotion(input: BodyMotionRequest) {
  const started = performance.now();
  const outcome = await recommendBodyMotion(input);
  const mj = outcome.physicsSteps ? await loadedMujoco() : null;

  return {
    outcome,
    metrics: {
      kind: outcome.kind,
      reason: outcome.kind === 'refused' ? outcome.reason : undefined,
      selected: outcome.selected,
      elapsedMs: performance.now() - started,
      physicsSteps: outcome.physicsSteps,
      wasmHeapBytes: mj ? wasmHeapBytes(mj) : 0,
    },
  };
}
