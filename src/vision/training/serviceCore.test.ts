import { describe, expect, it, vi } from 'vitest';
import { executeVisionTraining } from './serviceCore';
import type { TrainingServicePorts } from './serviceTypes';
import type { TrainingEvaluation } from './types';
import type { VisionManifest } from '../manifest';
import type { Dataset } from '../../datasets/datasetFile';
import { metricReport, metricTask, metricResult } from './metricsFixtures';

const hash = 'a'.repeat(64);
const manifest = (id: string): VisionManifest => ({
  version: 1,
  id,
  kind: 'detect',
  adapter: 'generic',
  classes: ['Cup', 'Plate'],
  input: { width: 32, height: 32, layout: 'nchw', mean: [0, 0, 0], std: [1, 1, 1], resize: 'stretch' },
  model: { source: 'local', sha256: id === 'candidate' ? hash : 'b'.repeat(64), bytes: 100 },
});

async function ports(options: { score?: number | null; incumbent?: number; cancel?: AbortController } = {}) {
  const saved: unknown[] = [];
  const candidate = manifest('candidate');
  const baseline = manifest('baseline');
  const report = await metricReport();
  const missed = await metricReport('detect', metricResult({ detections: [] }));
  const prepared = {
    dataset: { id: 'dataset' },
    version: { n: 1, hash },
    classes: metricTask().classes,
    provenance: [],
  };
  const evaluated = (model: VisionManifest): TrainingEvaluation => {
    const score = model.id === 'candidate' ? options.score : (options.incumbent ?? 0);
    const eligible = score !== null;
    const selected = score === undefined || (score !== null && score >= 0.5) ? report : missed;

    return {
      ...selected,
      modelHash: model.model.sha256,
      realTest: eligible ? selected.realTest : [],
      metrics: {
        ...selected.metrics,
        primary: eligible ? selected.metrics.primary : null,
        inference: { ...selected.metrics.inference, samples: eligible ? 1 : 0 },
      },
    };
  };
  const value: TrainingServicePorts = {
    prepare: vi.fn(async () => prepared as never),
    train: vi.fn(async () => ({
      manifest: candidate,
      baseline,
      jobId: hash,
      checkpoint: hash,
      parity: { maxAbsoluteError: 0, tolerance: 0.0001 },
    })),
    evaluate: vi.fn(async (_prepared, task, model) => {
      if (model.id === 'candidate') options.cancel?.abort();

      return { ...evaluated(model), task };
    }),
    load: vi.fn(async () => []),
    save: vi.fn(async (run) => {
      saved.push(run);
    }),
    now: () => '2026-11-15T13:00:00Z',
    id: () => 'attempt-1',
  };

  return { value, saved };
}

const dataset = { id: 'dataset' } as Dataset;

describe('vision training decisions', () => {
  it('evaluates initial model and candidate on the same prepared snapshot before retaining', async () => {
    const { value, saved } = await ports();
    const run = await executeVisionTraining(dataset, 'detect', {}, value);

    expect(run.status).toBe('retained');
    expect(saved).toEqual([run]);
    expect(value.evaluate).toHaveBeenCalledTimes(2);
    expect(vi.mocked(value.evaluate).mock.calls[0][0]).toBe(vi.mocked(value.evaluate).mock.calls[1][0]);
  });

  it('records a worse candidate without changing the retained model', async () => {
    const { value } = await ports({ score: 0, incumbent: 1 });
    const run = await executeVisionTraining(dataset, 'detect', {}, value);

    expect(run.status).toBe('checkpoint');
    expect(run.comparison.reason).toBe('no-improvement');
    expect(run.manifest.id).toBe('candidate');
  });

  it('keeps a checkpoint without real test predictions', async () => {
    const { value } = await ports({ score: null });
    const run = await executeVisionTraining(dataset, 'detect', {}, value);

    expect(run.status).toBe('checkpoint');
    expect(run.comparison.reason).toBe('no-real-test');
  });

  it('does not persist a decision if Stop arrives during evaluation', async () => {
    const cancel = new AbortController();
    const { value, saved } = await ports({ cancel });

    await expect(executeVisionTraining(dataset, 'detect', { signal: cancel.signal }, value)).rejects.toThrow();
    expect(saved).toEqual([]);
  });

  it('refuses mismatched exported model bytes before evaluating or retaining', async () => {
    const { value, saved } = await ports();

    vi.mocked(value.train).mockResolvedValue({
      manifest: manifest('candidate'),
      baseline: manifest('baseline'),
      jobId: hash,
      checkpoint: hash,
      parity: { maxAbsoluteError: 0.01, tolerance: 0.0001 },
    });
    await expect(executeVisionTraining(dataset, 'detect', {}, value)).rejects.toThrow('ONNX');
    expect(value.evaluate).not.toHaveBeenCalled();
    expect(saved).toEqual([]);
  });
});
