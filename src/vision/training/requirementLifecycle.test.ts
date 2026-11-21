import { expect, it, vi } from 'vitest';
import { executeVisionTraining } from './serviceCore';
import { conditionWorkflowFixture, conditionModel, CONDITION_WORKFLOWS } from './conditionWorkflowFixtures';
import { evaluateTraining } from './metrics';
import { checkedTrainingRun } from './runStore';
import type { TrainingServicePorts } from './serviceTypes';
import type { TrainingRequirement } from './requirementTypes';

async function fixture() {
  const definition = CONDITION_WORKFLOWS[0];
  const { fixture: source, prepared } = await conditionWorkflowFixture(definition);
  const candidate = await conditionModel(definition, true);
  const incumbent = await conditionModel(definition, false);
  const requirement: TrainingRequirement = {
    group: { kind: 'condition', name: 'night' },
    metric: 'box-map',
    minScore: 1,
    minRealTest: 1,
    maxRegression: 0,
  };
  const ports: TrainingServicePorts = {
    prepare: async () => prepared,
    load: async () => [],
    train: vi.fn(async () => ({
      manifest: candidate.manifest,
      baseline: incumbent.manifest,
      jobId: 'requirements',
      checkpoint: candidate.manifest.model.sha256,
      parity: { maxAbsoluteError: 0, tolerance: 0.0001 },
    })),
    evaluate: async (_prepared, task, manifest) =>
      evaluateTraining({
        task,
        sets: prepared.sets,
        snapshot: prepared.evaluationSamples,
        realSourceIds: prepared.realSourceIds,
        modelHash: manifest.model.sha256,
        modelBytes: manifest.model.bytes,
        predictions: prepared.samples
          .filter((sample) => sample.split === 'test')
          .map((sample) => ({
            frameSetId: sample.frameSetId,
            frameId: sample.frameId,
            inferenceMs: 1,
            result: {
              modelId: manifest.id,
              timestamp: 0,
              width: 8,
              height: 8,
              detections:
                manifest.model.sha256 === candidate.manifest.model.sha256 || sample.frameId === 'sample-2'
                  ? [{ label: 'Cup', score: 0.9, box: [0, 0, 1, 1] }]
                  : [],
            },
          })),
      }),
    save: vi.fn(async (run) => {
      checkedTrainingRun(run);
    }),
    id: () => 'requirements',
    now: () => '2026-11-17T12:00:00Z',
  };

  return { source, prepared, requirement, ports };
}

it('freezes declarations before preparation and dispatch, then reevaluates the incumbent with that same task', async () => {
  const { source, prepared, requirement, ports } = await fixture();
  const requirements = [requirement];
  const prepare = ports.prepare;

  ports.prepare = async (...args) => {
    requirement.minScore = 0;
    requirements.length = 0;

    return prepare(...args);
  };

  const evaluate = vi.fn(ports.evaluate);

  ports.evaluate = evaluate;

  const run = await executeVisionTraining(source.dataset, 'detect', { requirements }, ports);

  expect(run.status).toBe('retained');
  expect(run.comparison.requirements![0]).toMatchObject({ candidate: 1, incumbent: 1, support: 1, reason: 'passed' });
  expect(run.report.task.requirements![0].minScore).toBe(1);
  expect(evaluate.mock.calls[0][1]).toEqual(evaluate.mock.calls[1][1]);
  expect(run.provenance).toEqual(prepared.provenance);

  const historical = JSON.stringify(run);

  prepared.sets.forEach((set) => {
    set.frames.forEach((frame) => {
      frame.conditions = [];
    });
  });
  expect(JSON.stringify(checkedTrainingRun(JSON.parse(historical)))).toBe(historical);
});

it('discards evaluation completion after cancellation without saving a stale retention decision', async () => {
  const { source, requirement, ports } = await fixture();
  const controller = new AbortController();
  const evaluate = ports.evaluate;

  ports.evaluate = async (...args) => {
    const result = await evaluate(...args);

    controller.abort();

    return result;
  };

  await expect(
    executeVisionTraining(source.dataset, 'detect', { requirements: [requirement], signal: controller.signal }, ports),
  ).rejects.toThrow();
  expect(ports.save).not.toHaveBeenCalled();
});

it('rejects a source crossing frozen splits before any requirement can count it', async () => {
  const { source, requirement, ports, prepared } = await fixture();

  prepared.evaluationSamples[0].source = prepared.evaluationSamples[2].source;

  await expect(executeVisionTraining(source.dataset, 'detect', { requirements: [requirement] }, ports)).rejects.toThrow(
    'one frozen split',
  );
  expect(ports.save).not.toHaveBeenCalled();
});
