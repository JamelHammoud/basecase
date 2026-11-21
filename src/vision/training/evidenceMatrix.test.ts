import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { env, InferenceSession } from 'onnxruntime-web/wasm';
import { VisionEngine } from '../engine';
import { evaluateTraining } from './metrics';
import { executeVisionTraining } from './serviceCore';
import { checkedTrainingRun } from './runStore';
import { verifyEvidence } from './evidence';
import { EVIDENCE_CASES, evidenceMatrixFixture, evidenceModel, type EvidenceCase } from './evidenceMatrixFixtures';
import { comparisonImages, filterComparisonImages } from './inspection';
import { inspectionImage } from './inspectionImage';
import type { TrainingEvaluation } from './types';
import type { TrainingRun } from './serviceTypes';

const fields = ['support', 'truePositive', 'falsePositive', 'falseNegative'] as const;

env.wasm.numThreads = 1;

function expectReportTotals(report: TrainingEvaluation) {
  for (const category of report.metrics.perClass) {
    const rows = report.evidence!.frames.map((frame) =>
      frame.classes.find((entry) => entry.classId === category.classId)!,
    );

    for (const field of fields) expect(rows.reduce((sum, row) => sum + row[field], 0)).toBe(category[field]);
  }
}

function expectFailureSemantics(report: TrainingEvaluation, test: EvidenceCase) {
  expect(report.metrics.perClass.reduce((sum, category) => sum + category.falseNegative, 0)).toBe(test.missed);
  expect(report.metrics.perClass.reduce((sum, category) => sum + category.falsePositive, 0)).toBe(test.extra);

  if (test.kind !== 'keypoints') return;

  const points = report.metrics.perClass.reduce(
    (sum, category) => ({
      visible: sum.visible + (category.keypoints?.visible ?? 0),
      correct: sum.correct + (category.keypoints?.correct ?? 0),
    }),
    { visible: 0, correct: 0 },
  );

  expect(points).toEqual({ visible: 1, correct: test.name === 'invisible keypoint' ? 1 : 0 });
}

describe('frozen evaluation real ONNX matrix', () => {
  it.each(EVIDENCE_CASES)(
    '$name crosses image preparation, inference, metrics, retention and save/reopen',
    async (test) => {
      const { fixture, prepared, label } = await evidenceMatrixFixture(test);
      const classes = prepared.classes.map((category) => category.name);
      const good = await evidenceModel({ test, label, bad: false, classes });
      const bad = await evidenceModel({ test, label, bad: true, classes });
      const candidate = test.regression ? bad : good;
      const baseline = test.regression ? good : bad;
      const engine = new VisionEngine((bytes) => InferenceSession.create(bytes, { executionProviders: ['wasm'] }));
      let saved = '';

      try {
        const run = await executeVisionTraining(
          fixture.dataset,
          test.kind,
          {},
          {
            prepare: async () => prepared,
            train: async () => ({
              manifest: candidate.manifest,
              baseline: baseline.manifest,
              jobId: 'matrix',
              checkpoint: candidate.manifest.model.sha256,
              parity: { maxAbsoluteError: 0, tolerance: 0.0001 },
            }),
            load: async () => [],
            save: async (value) => {
              saved = JSON.stringify(checkedTrainingRun(value));
            },
            id: () => 'matrix',
            now: () => '2026-11-16T00:00:00Z',
            evaluate: async (_input, task, manifest) => {
              const predictions = [];

              for (const set of prepared.sets) {
                const frame = set.frames.find((entry) => entry.id === 'test');

                if (!frame) continue;

                const model = [good, bad].find((entry) => entry.manifest.id === manifest.id)!;

                await engine.load(model.manifest, model.bytes);

                const pixels = await sharp(frame.jpeg).ensureAlpha().raw().toBuffer();
                const result = await engine.infer(model.manifest.id, {
                  width: frame.width,
                  height: frame.height,
                  data: new Uint8ClampedArray(pixels),
                });

                expect(result.modelId).toBe(manifest.id);
                predictions.push({ frameSetId: set.id, frameId: frame.id, result, inferenceMs: 1 });
              }

              return evaluateTraining({
                task,
                sets: prepared.sets,
                snapshot: prepared.samples,
                realSourceIds: prepared.realSourceIds,
                predictions,
                modelHash: manifest.model.sha256,
                modelBytes: manifest.model.bytes,
              });
            },
          },
        );
        const reopened: TrainingRun = checkedTrainingRun(JSON.parse(saved));
        const failed = test.regression ? reopened.report : reopened.incumbentReport;

        expect(reopened).toEqual(run);
        expect(run.report.modelHash).toBe(candidate.manifest.model.sha256);
        expect(run.incumbentReport.modelHash).toBe(baseline.manifest.model.sha256);
        expect(run.report.testHash).toBe(run.incumbentReport.testHash);
        expectFailureSemantics(failed, test);

        for (const report of [reopened.report, reopened.incumbentReport]) {
          await verifyEvidence(report);
          expectReportTotals(report);
        }

        const images = comparisonImages(run.report, run.incumbentReport);
        const finding = test.regression ? 'regressions' : 'improvements';
        const expected = ['correct empty image', 'invisible keypoint'].includes(test.name) ? 0 : 1;

        expect(filterComparisonImages(images, { finding, classId: null })).toHaveLength(expected);
        expect(run.status).toBe(expected && !test.regression ? 'retained' : 'checkpoint');

        for (const image of images) {
          const displayed = await inspectionImage({
            sample: image.candidate.sample,
            bytes: fixture.blobs.get(image.candidate.sample.content)!,
            candidate: image.candidate.prediction,
            incumbent: image.incumbent.prediction,
            task: run.report.task,
          });

          expect(displayed.set.frames[0].id).toBe('test');
          expect(displayed.set.frames[0].origin?.tryId).toBe('test');
        }
      } finally {
        await engine.close();
      }
    },
  );
});
