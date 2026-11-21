import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { env, InferenceSession } from 'onnxruntime-web/wasm';
import { VisionEngine } from '../engine';
import { CONDITION_WORKFLOWS, conditionModel, conditionWorkflowFixture } from './conditionWorkflowFixtures';
import { executeVisionTraining } from './serviceCore';
import { evaluateTraining } from './metrics';
import { checkedTrainingRun } from './runStore';
import { evaluateImageGroup, frozenImageGroups } from './conditionEvaluation';
import type { TrainingPrediction } from './types';
import { sampleKey } from './evaluationIdentity';
import type { VisionResult } from '../types';

env.wasm.numThreads = 1;

describe('condition workflow real ONNX parity', () => {
  it.each(CONDITION_WORKFLOWS)('$name preserves declared members and independently expected metrics', async (test) => {
    const { fixture, prepared } = await conditionWorkflowFixture(test);
    const candidate = await conditionModel(test, true);
    const incumbent = await conditionModel(test, false);
    const engine = new VisionEngine((bytes) => InferenceSession.create(bytes, { executionProviders: ['wasm'] }));
    let saved = '';
    let inferences = 0;

    try {
      const run = await executeVisionTraining(
        fixture.dataset,
        test.kind,
        {},
        {
          prepare: async () => prepared,
          train: async () => ({
            manifest: candidate.manifest,
            baseline: incumbent.manifest,
            jobId: 'conditions',
            checkpoint: candidate.manifest.model.sha256,
            parity: { maxAbsoluteError: 0, tolerance: 0.0001 },
          }),
          load: async () => [],
          save: async (value) => {
            saved = JSON.stringify(checkedTrainingRun(value));
          },
          id: () => 'conditions',
          now: () => '2026-11-17T12:00:00Z',
          evaluate: async (_input, task, manifest) => {
            const model = manifest.model.sha256 === candidate.manifest.model.sha256 ? candidate : incumbent;

            await engine.load(model.manifest, model.bytes);

            const predictions: TrainingPrediction[] = [];

            for (const sample of prepared.samples.filter((entry) => entry.split === 'test')) {
              const frame = prepared.sets
                .find((set) => set.id === sample.frameSetId)!
                .frames.find((entry) => entry.id === sample.frameId)!;
              const pixels = await sharp(frame.jpeg).ensureAlpha().raw().toBuffer();
              const result = await engine.infer(manifest.id, {
                width: frame.width,
                height: frame.height,
                data: new Uint8ClampedArray(pixels),
              });

              expectOnnxParity({
                test,
                result,
                candidate: manifest.model.sha256 === candidate.manifest.model.sha256,
                pixels,
              });
              inferences++;
              expect(result.width).toBe(8);
              expect(result.height).toBe(8);

              if (prepared.realSourceIds.includes(sample.source))
                predictions.push({ frameSetId: sample.frameSetId, frameId: sample.frameId, result, inferenceMs: 1 });
            }

            return evaluateTraining({
              task,
              sets: prepared.sets,
              snapshot: prepared.evaluationSamples,
              realSourceIds: prepared.realSourceIds,
              predictions,
              modelHash: manifest.model.sha256,
              modelBytes: manifest.model.bytes,
            });
          },
        },
      );
      const reopened = checkedTrainingRun(JSON.parse(saved));
      const reports = { candidate: reopened.report, incumbent: reopened.incumbentReport };
      const group = frozenImageGroups(reports.candidate).find(
        (item) => item.kind === test.group.kind && item.name === test.group.name,
      )!;
      const count = inferences;
      const comparison = await evaluateImageGroup(
        { ...reports, group: test.group },
        async (hash) => fixture.blobs.get(hash) ?? null,
      );

      expect(group.keys).toEqual(test.expectedKeys);
      expect(comparison.support.keys).toEqual(test.expectedKeys);
      expect(comparison.candidate.primary).toBe(test.candidate);
      expect(comparison.incumbent.primary).toBe(test.incumbent);
      expect(inferences).toBe(count);
      expect(reopened).toEqual(run);

      if (['brightness', 'classification', 'small'].includes(test.mode)) {
        expect(reopened.report.metrics.primary!).toBeGreaterThan(reopened.incumbentReport.metrics.primary!);
        expect(reopened.status).toBe('retained');
      }

      expectAggregateScores(test, reopened.report.metrics.primary, reopened.incumbentReport.metrics.primary);

      if (test.mode === 'import') {
        expect(comparison.support).toMatchObject({ realTest: 0, otherTest: 1 });
        expect(reopened.status).toBe('checkpoint');
        expect(reopened.comparison.reason).toBe('no-real-test');
      }

      if (test.kind === 'keypoints') {
        expect(comparison.candidate.perClass[0].keypoints).toEqual({ visible: 1, correct: 0 });
        expect(comparison.incumbent.perClass[0].keypoints).toEqual({ visible: 1, correct: 1 });
      }

      expect(new Set(reopened.report.snapshot.map(sampleKey)).size).toBe(reopened.report.snapshot.length);
      fixture.sets.forEach((set) => {
        set.frames.forEach((frame) => {
          frame.conditions = [];
        });
      });
      expect(
        await evaluateImageGroup({ ...reports, group: test.group }, async (hash) => fixture.blobs.get(hash) ?? null),
      ).toEqual(comparison);
      expect(JSON.stringify(reopened)).toBe(saved);
    } finally {
      await engine.close();
    }
  });
});

type ParityInput = {
  test: (typeof CONDITION_WORKFLOWS)[number];
  result: VisionResult;
  candidate: boolean;
  pixels: Uint8Array;
};

function expectOnnxParity(input: ParityInput) {
  if (input.test.mode === 'brightness') return expectBrightnessParity(input);

  if (input.test.kind === 'classify') return expectClassificationParity(input);

  expectObjectParity(input);
}

function expectBrightnessParity({ result, candidate, pixels }: ParityInput) {
  const rgb = pixels.filter((_, index) => index % 4 !== 3);
  const brightness = rgb.reduce((sum, value) => sum + value, 0) / (rgb.length * 255);
  const confidence = candidate ? 0.01 + 0.9 * brightness : 0.95 - 0.9 * brightness;
  const present = confidence > 0.5;

  expect(result.detections).toHaveLength(Number(present));
  expect(result.detections[0]?.score ?? 0).toBeCloseTo(present ? confidence : 0, 5);
}

function expectClassificationParity({ result, candidate }: ParityInput) {
  const top = [...(result.classes ?? [])].sort((left, right) => right.score - left.score)[0];

  expect(top?.label).toBe(candidate ? 'Microwave' : 'Refrigerator');
  expect(top?.score).toBeCloseTo(0.9, 5);
}

function expectObjectParity({ test, result, candidate }: ParityInput) {
  const side = !candidate && ['small', 'occluded'].includes(test.mode) ? 0.25 : 1;

  expect(result.detections[0].box).toEqual([0, 0, side, side]);
  expect(result.detections[0].label).toBe(candidate && test.mode === 'class-error' ? 'Plate' : 'Cup');

  if (test.kind === 'segment')
    expect(result.detections[0].mask?.values.reduce((sum, value) => sum + value, 0)).toBe(candidate ? 4 : 64);

  if (test.kind === 'keypoints')
    expect(result.detections[0].keypoints).toEqual(
      candidate
        ? [
            [0, 0],
            [0.5, 0.5],
          ]
        : [
            [0.5, 0.5],
            [0, 0],
          ],
    );
}

function expectAggregateScores(
  test: (typeof CONDITION_WORKFLOWS)[number],
  candidate: number | null,
  incumbent: number | null,
) {
  const expected: Record<string, [number, number]> = {
    brightness: [67 / 101, 34 / 101],
    small: [134 / 303, 34 / 101],
    occluded: [67 / 101, 34 / 303],
    classification: [2 / 3, 1 / 3],
  };
  const pair = expected[test.mode];

  if (!pair) return;

  expect(candidate).toBeCloseTo(pair[0], 10);
  expect(incumbent).toBeCloseTo(pair[1], 10);
}
