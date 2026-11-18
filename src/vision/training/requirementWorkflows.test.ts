import { applyVisionRun } from './service';
import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { env, InferenceSession } from 'onnxruntime-web/wasm';
import { VisionEngine } from '../engine';
import { CONDITION_WORKFLOWS, conditionModel, conditionWorkflowFixture } from './conditionWorkflowFixtures';
import { executeVisionTraining } from './serviceCore';
import { evaluateTraining } from './metrics';
import { checkedTrainingRun } from './runStore';
import { verifyEvidence } from './evidence';
import type { TrainingPrediction, TrainingTask } from './types';
import type { VisionManifest } from '../manifest';
import type { PreparedVisionTraining } from './prepare';

const workflows = [
  { name: 'rover low-light person detector', fixture: 0, kind: 'detect', aggregate: [67 / 101, 34 / 101] },
  { name: 'arm occluded-part detector', fixture: 3, kind: 'detect', aggregate: [67 / 101, 34 / 303] },
  { name: 'warehouse rare pallet detector', fixture: 2, kind: 'detect', aggregate: [134 / 303, 34 / 101] },
  { name: 'kitchen mug segmenter', fixture: 6, kind: 'segment', aggregate: [0, 1] },
  { name: 'reflective-bin segmentation', fixture: 6, kind: 'segment', aggregate: [0, 1] },
  { name: 'gripper handle keypoints', fixture: 7, kind: 'keypoints', aggregate: [0, 1] },
  { name: 'desk robot named landmarks', fixture: 7, kind: 'keypoints', aggregate: [0, 1] },
  { name: 'appliance-state classification', fixture: 8, kind: 'classify', aggregate: [2 / 3, 1 / 3] },
  { name: 'inspection-defect classification', fixture: 8, kind: 'classify', aggregate: [2 / 3, 1 / 3] },
  { name: 'two-camera robot weak wrist camera', fixture: 1, kind: 'detect', aggregate: [67 / 101, 34 / 101] },
] as const;

env.wasm.numThreads = 1;

async function predict(input: {
  engine: VisionEngine;
  prepared: PreparedVisionTraining;
  manifest: VisionManifest;
  task: TrainingTask;
}) {
  const predictions: TrainingPrediction[] = [];

  for (const sample of input.prepared.samples.filter((entry) => entry.split === 'test')) {
    const frame = input.prepared.sets
      .find((set) => set.id === sample.frameSetId)!
      .frames.find((entry) => entry.id === sample.frameId)!;
    const pixels = await sharp(frame.jpeg).ensureAlpha().raw().toBuffer();
    const result = await input.engine.infer(input.manifest.id, {
      width: frame.width,
      height: frame.height,
      data: new Uint8ClampedArray(pixels),
    });

    predictions.push({ frameSetId: sample.frameSetId, frameId: sample.frameId, result, inferenceMs: 1 });
  }

  return evaluateTraining({
    task: input.task,
    sets: input.prepared.sets,
    snapshot: input.prepared.evaluationSamples,
    realSourceIds: input.prepared.realSourceIds,
    predictions,
    modelHash: input.manifest.model.sha256,
    modelBytes: input.manifest.model.bytes,
  });
}

describe('operating requirement production pipeline', () => {
  it.each(workflows)('$name keeps its independently scored failure as a checkpoint', async (workflow) => {
    const templates = CONDITION_WORKFLOWS;
    const classNames: [string, string][] = [
      ['Person', 'Vehicle'],
      ['Part', 'Tool'],
      ['Pallet', 'Person'],
      ['Mug', 'Plate'],
      ['Bin', 'Cart'],
      ['Handle', 'Jaw'],
      ['Landmark', 'Marker'],
      ['Off', 'On'],
      ['Clean', 'Defect'],
      ['Person', 'Vehicle'],
    ];
    const at = workflows.indexOf(workflow);
    const definition = {
      ...templates[workflow.fixture],
      classNames: classNames[at],
      ...(workflow.kind === 'keypoints' ? { landmarks: ['anchor', 'hidden'] as [string, string] } : {}),
      ...(at === 4
        ? {
            conditionAlias: { from: 'glare', to: 'reflective' },
            group: { kind: 'condition' as const, name: 'reflective' },
          }
        : {}),
    };
    const { fixture, prepared } = await conditionWorkflowFixture(definition);
    const candidate = await conditionModel(definition, true);
    const incumbent = await conditionModel(definition, false);
    const engine = new VisionEngine((bytes) => InferenceSession.create(bytes, { executionProviders: ['wasm'] }));
    const group = definition.group;
    let saved = '';
    const infer = vi.spyOn(engine, 'infer');

    if (group.kind === 'source') throw new Error('Use an operating condition or camera.');

    try {
      const run = await executeVisionTraining(
        fixture.dataset,
        workflow.kind,
        {
          requirements: [
            {
              group: { kind: group.kind, name: group.name },
              metric: { detect: 'box-map', segment: 'mask-map', keypoints: 'keypoint-pck', classify: 'accuracy' }[
                workflow.kind
              ] as TrainingTask['metric'],
              minScore: 0,
              minRealTest: 1,
              maxRegression: 0,
            },
          ],
        },
        {
          prepare: async () => prepared,
          load: async () => [],
          train: async () => ({
            manifest: candidate.manifest,
            baseline: incumbent.manifest,
            jobId: 'requirements',
            checkpoint: candidate.manifest.model.sha256,
            parity: { maxAbsoluteError: 0, tolerance: 0.0001 },
          }),
          evaluate: async (_prepared, task, manifest) => {
            const model = manifest.model.sha256 === candidate.manifest.model.sha256 ? candidate : incumbent;

            await engine.load(model.manifest, model.bytes);

            return predict({ engine, prepared, manifest, task });
          },
          save: async (value) => {
            saved = JSON.stringify(checkedTrainingRun(value));
          },
          id: () => 'requirements',
          now: () => '2026-11-17T12:00:00Z',
        },
      );
      const reopened = checkedTrainingRun(JSON.parse(saved));
      const measurement = reopened.report.evidence!.requirements![0];

      expect(infer).toHaveBeenCalledTimes(6);
      expect(run.status).toBe('checkpoint');
      expect(run.reason).toBe('requirements');
      expect(run.report.metrics.primary).toBeCloseTo(workflow.aggregate[0], 10);
      expect(run.incumbentReport.metrics.primary).toBeCloseTo(workflow.aggregate[1], 10);
      expect(measurement.score).toBe(0);
      expect(run.incumbentReport.evidence!.requirements![0].score).toBe(1);
      expect(run.comparison.requirements![0].reason).toBe('regression');
      expect(
        measurement.indices.map(
          (index) => `${run.report.realTest[index].frameSetId}:${run.report.realTest[index].frameId}`,
        ),
      ).toEqual(definition.expectedKeys);
      expect(reopened).toEqual(run);
      await expect(applyVisionRun(reopened, { scene: 'scene', camera: 'front', node: 'objects' })).rejects.toThrow(
        'retained',
      );
      expect(reopened.datasetId).toBe(fixture.dataset.id);
      expect(reopened.report.modelHash).toBe(candidate.manifest.model.sha256);
      expect(reopened.incumbentReport.modelHash).toBe(incumbent.manifest.model.sha256);
      await verifyEvidence(reopened.report);
      fixture.sets.forEach((set) => {
        set.frames.forEach((frame) => {
          frame.conditions = [];
        });
      });
      expect(JSON.stringify(reopened)).toBe(saved);
    } finally {
      await engine.close();
    }
  });
});
