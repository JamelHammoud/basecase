import type { VisionManifest } from '../src/vision/manifest';
import type { TrainingRun } from '../src/vision/training/serviceTypes';
import type { TrainingEvaluation } from '../src/vision/training/types';

export function visionTrainingRun(improved = true): TrainingRun {
  const manifest: VisionManifest = {
    version: 1,
    id: improved ? 'cup-improved' : 'cup-worse',
    kind: 'detect',
    adapter: 'generic',
    classes: ['cup'],
    input: { width: 2, height: 2, layout: 'nchw', mean: [0, 0, 0], std: [1, 1, 1] },
    model: { source: 'local', sha256: 'a'.repeat(64), bytes: 1048576 },
  };
  const score = improved ? 0.85 : 0.55;
  const report: TrainingEvaluation = {
    version: 1,
    protocol: 'vision-eval-v1',
    modelHash: manifest.model.sha256,
    snapshot: [],
    realTest: [],
    testHash: 'b'.repeat(64),
    task: {
      kind: 'detect',
      classes: [{ id: 0, name: 'cup' }],
      metric: 'box-map',
      limits: { maxInferenceMs: 100, maxModelBytes: 268435456 },
    },
    metrics: {
      primary: score,
      perClass: [
        {
          classId: 0,
          name: 'cup',
          support: 10,
          truePositive: 8,
          falsePositive: 1,
          falseNegative: 2,
          failureRate: 0.2,
          score,
        },
      ],
      inference: { samples: 10, meanMs: 8, p95Ms: 12.5, modelBytes: 1048576 },
    },
  };
  const status = improved ? 'retained' : 'checkpoint';
  const reason = improved ? 'improved' : 'no-improvement';

  return {
    version: 1,
    id: manifest.id,
    datasetId: 'vision-images',
    datasetVersion: 1,
    at: '2026-11-15T12:00:00Z',
    kind: 'detect',
    manifest,
    baseline: manifest,
    jobId: 'training-fixture',
    checkpoint: 'c'.repeat(64),
    parity: { maxAbsoluteError: 0, tolerance: 0.0001 },
    status,
    reason,
    report,
    incumbentReport: { ...report, metrics: { ...report.metrics, primary: 0.75 } },
    provenance: [],
    comparison: {
      id: manifest.id,
      at: '2026-11-15T12:00:00Z',
      candidateHash: manifest.model.sha256,
      incumbentHash: 'd'.repeat(64),
      testHash: report.testHash,
      metric: 'box-map',
      candidateScore: score,
      incumbentScore: 0.75,
      previousAttempts: improved ? 0 : 1,
      status,
      reason,
    },
  };
}
