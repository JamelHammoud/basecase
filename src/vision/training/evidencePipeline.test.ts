import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { InferenceSession, env } from 'onnxruntime-web/wasm';
import { VisionEngine } from '../engine';
import { tinyDetectionOnnx } from '../onnxFixture';
import type { VisionManifest } from '../manifest';
import { datasetContentHash } from '../../datasets/contentHash';
import { restoreImages } from '../../datasets/snapshotImages';
import { metricSet } from './metricsFixtures';
import { preparationFixture, preparationTry } from './prepareFixtures';
import { prepareVisionTraining } from './prepare';
import { evaluateTraining } from './metrics';
import { executeVisionTraining } from './serviceCore';
import { checkedTrainingRun } from './runStore';
import { verifyEvidence } from './evidence';
import { inspectionImage } from './inspectionImage';
import type { TrainingRun } from './serviceTypes';

env.wasm.numThreads = 1;

async function pipelineFixture() {
  const set = metricSet();
  const sources = ['train', 'validation', 'test'].map((split) => ({
    ...preparationTry(split),
    split: split as 'test',
  }));

  set.frames = await Promise.all(
    sources.map(async (source, index) => ({
      ...structuredClone(set.frames[0]),
      id: source.id,
      jpeg: new Uint8Array(
        await sharp({ create: { width: 2, height: 2, channels: 3, background: { r: index * 100, g: 0, b: 0 } } })
          .jpeg()
          .toBuffer(),
      ),
      origin: { tryId: source.id, frame: 0, seconds: 0 },
      split: source.split,
    })),
  );

  const fixture = await preparationFixture([set], sources);
  const prepared = await prepareVisionTraining(fixture.dataset, 'detect', { ports: fixture.ports });
  const model = async (confidence: number): Promise<{ bytes: Uint8Array; manifest: VisionManifest }> => {
    const bytes = tinyDetectionOnnx([0, 0, 1, 1, confidence, 0]);
    const hash = await datasetContentHash(bytes);

    return {
      bytes,
      manifest: {
        version: 1,
        id: `test-${hash.slice(0, 16)}`,
        kind: 'detect',
        adapter: 'generic',
        classes: prepared.classes.map((category) => category.name),
        input: { width: 2, height: 2, layout: 'nchw', mean: [0, 0, 0], std: [1, 1, 1] },
        model: { source: 'local', sha256: hash, bytes: bytes.length },
      },
    };
  };

  return { fixture, prepared, candidate: await model(0.9), baseline: await model(0.01), set };
}

describe('prediction evidence production pipeline', () => {
  it('runs generated ONNX, persists an immutable comparison and restores only the selected historical image', async () => {
    const { fixture, prepared, candidate, baseline, set } = await pipelineFixture();
    const engine = new VisionEngine((bytes) => InferenceSession.create(bytes, { executionProviders: ['wasm'] }));
    let saved = '';

    try {
      const run = await executeVisionTraining(
        fixture.dataset,
        'detect',
        {},
        {
          prepare: async () => prepared,
          train: async () => ({
            manifest: candidate.manifest,
            baseline: baseline.manifest,
            jobId: 'job',
            checkpoint: candidate.manifest.model.sha256,
            parity: { maxAbsoluteError: 0, tolerance: 0.0001 },
          }),
          load: async () => [],
          save: async (value) => {
            saved = JSON.stringify(checkedTrainingRun(value));
          },
          id: () => 'comparison',
          now: () => '2026-11-16T12:00:00Z',
          evaluate: async (_prepared, task, manifest) => {
            await engine.load(manifest, manifest.id === candidate.manifest.id ? candidate.bytes : baseline.bytes);

            const result = await engine.infer(manifest.id, { width: 2, height: 2, data: new Uint8ClampedArray(16) });

            return evaluateTraining({
              task,
              sets: prepared.sets,
              snapshot: prepared.samples,
              realSourceIds: prepared.realSourceIds,
              predictions: [{ frameSetId: set.id, frameId: 'test', result, inferenceMs: 1 }],
              modelHash: manifest.model.sha256,
              modelBytes: manifest.model.bytes,
            });
          },
        },
      );
      const reopened: TrainingRun = checkedTrainingRun(JSON.parse(saved));

      expect(reopened).toEqual(run);
      expect(reopened.status).toBe('retained');
      expect(reopened.report.metrics.primary).toBe(1);
      expect(reopened.incumbentReport.metrics.primary).toBe(0);
      await verifyEvidence(reopened.report);
      await verifyEvidence(reopened.incumbentReport);

      const next = reopened.report.evidence!.frames[0];
      const previous = reopened.incumbentReport.evidence!.frames[0];
      const bytes = fixture.blobs.get(next.sample.content)!;
      const image = await inspectionImage({
        sample: next.sample,
        bytes,
        task: reopened.report.task,
        candidate: next.prediction,
        incumbent: previous.prediction,
      });

      expect(image.set.frames[0].jpeg).toEqual(set.frames[2].jpeg);
      expect(image.set.frames[0].origin).toEqual({ tryId: 'test', frame: 0, seconds: 0 });
      expect(image.set.frames[0].annotations[0].classId).toBe(
        prepared.classes.find((category) => category.name === 'Cup')!.id,
      );
      expect(image.candidate).toHaveLength(1);
      expect(image.incumbent).toEqual([]);
      set.frames[2].annotations = [];

      const historical = await restoreImages([next.sample], async (hash) => fixture.blobs.get(hash) ?? null);

      expect(historical[0].frames[0].annotations).toHaveLength(1);
      expect(JSON.parse(saved)).toEqual(run);
      await expect(restoreImages([next.sample], async () => null)).rejects.toThrow('missing frozen');
      await expect(
        inspectionImage({
          sample: { ...next.sample, hash: 'f'.repeat(64) },
          bytes,
          task: run.report.task,
          candidate: next.prediction,
          incumbent: previous.prediction,
        }),
      ).rejects.toThrow('changed');
    } finally {
      await engine.close();
    }
  });
});
