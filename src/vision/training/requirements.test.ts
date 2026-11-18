import { requirementMeasurements } from './requirementEvaluation';
import { imageGroups } from '../conditions';
import { encodeMask } from '../imageMasks';
import { describe, expect, it } from 'vitest';
import { evaluateTraining } from './metrics';
import { metricSet, metricSnapshot, metricResult, metricTask } from './metricsFixtures';
import { compareTraining } from './retention';
import { verifyEvidence } from './evidence';
import { canonicalRequirements } from './requirements';
import type { TrainingRequirement } from './requirementTypes';

const requirement: TrainingRequirement = {
  group: { kind: 'condition', name: 'night' },
  metric: 'box-map',
  minScore: 1,
  minRealTest: 1,
  maxRegression: 0,
};

async function report(options: { requirements?: TrainingRequirement[]; correct?: boolean; real?: boolean } = {}) {
  const set = metricSet();

  set.conditions = ['night', 'glare', 'empty'];
  set.frames[0].conditions = ['night', 'glare'];

  return evaluateTraining({
    task: { ...metricTask(), requirements: options.requirements ?? [requirement] },
    sets: [set],
    snapshot: await metricSnapshot(set),
    realSourceIds: options.real === false ? [] : ['try:real'],
    predictions:
      options.real === false
        ? []
        : [
            {
              frameSetId: set.id,
              frameId: 'one',
              result: metricResult({ detections: options.correct === false ? [] : metricResult().detections }),
              inferenceMs: 1,
            },
          ],
    modelHash: (options.correct === false ? 'c' : 'b').repeat(64),
    modelBytes: 1024,
  });
}

function compare(candidate: Awaited<ReturnType<typeof report>>, incumbent: typeof candidate) {
  return compareTraining({ id: 'attempt', at: '2026-11-17T12:00:00Z', candidate, incumbent, history: [] });
}

describe('declared operating requirements', () => {
  it('retains equality at the score and support thresholds and preserves overlap', async () => {
    const requirements = [requirement, { ...requirement, group: { kind: 'condition' as const, name: 'glare' } }];
    const candidate = await report({ requirements });
    const incumbent = await report({ requirements, correct: false });

    expect(compare(candidate, incumbent).status).toBe('retained');
    expect(candidate.evidence?.requirements?.map((row) => row.indices)).toEqual([[0], [0]]);
    expect(candidate.evidence?.requirements?.map((row) => row.score)).toEqual([1, 1]);
    expect(compare(candidate, incumbent).attempt.requirements?.every((row) => row.reason === 'passed')).toBe(true);
  });

  it.each([
    { change: { minRealTest: 2 }, reason: 'insufficient-support' },
    { change: { group: { kind: 'condition' as const, name: 'missing' } }, reason: 'missing-group' },
    { change: { group: { kind: 'condition' as const, name: 'empty' } }, reason: 'insufficient-support' },
    { change: { classId: 2 }, reason: 'insufficient-support' },
  ])('keeps a checkpoint for $reason', async ({ change, reason }) => {
    const requirements = [{ ...requirement, ...change }];
    const candidate = await report({ requirements });
    const incumbent = await report({ requirements, correct: false });

    expect(compare(candidate, incumbent)).toMatchObject({ status: 'checkpoint', reason: 'requirements' });
    expect(compare(candidate, incumbent).attempt.requirements?.[0].reason).toBe(reason);
  });

  it('excludes synthetic and unverified support and refuses unavailable evidence', async () => {
    const candidate = await report({ real: false });

    expect(candidate.evidence?.requirements?.[0]).toMatchObject({ support: 0, score: null });

    const real = await report();
    const incumbent = await report({ correct: false });

    delete real.evidence;
    expect(compare(real, incumbent)).toMatchObject({ status: 'checkpoint', reason: 'requirements' });
    expect(compare(real, incumbent).attempt.requirements?.[0].reason).toBe('unavailable');
  });

  it('binds requirement evidence to its digest and leaves historical copies unchanged', async () => {
    const original = await report();
    const reopened = JSON.parse(JSON.stringify(original));

    await verifyEvidence(reopened);
    reopened.evidence.requirements[0].score = 0;
    await expect(verifyEvidence(reopened)).rejects.toThrow();
    expect(original.evidence?.requirements?.[0].score).toBe(1);
  });

  it('validates task metrics, class identities, bounds and canonical definitions', () => {
    const task = metricTask();

    expect(canonicalRequirements([requirement], task)).toEqual([requirement]);
    expect(() => canonicalRequirements([{ ...requirement, metric: 'accuracy' }], task)).toThrow();
    expect(() => canonicalRequirements([{ ...requirement, classId: 99 }], task)).toThrow();
    expect(() => canonicalRequirements([{ ...requirement, minRealTest: 0 }], task)).toThrow();
    expect(() =>
      canonicalRequirements(
        Array.from({ length: 17 }, () => requirement),
        task,
      ),
    ).toThrow();
    expect(() => canonicalRequirements([requirement, requirement], task)).toThrow();
  });
});

it('bounds segmentation pixel comparisons before decoding or resizing masks', async () => {
  const set = metricSet();
  const frame = set.frames[0];

  set.conditions = ['night'];
  frame.conditions = ['night'];
  frame.width = 512;
  frame.height = 512;
  frame.annotations[0].mask = encodeMask(new Uint8Array(512 * 512), 512, 512);

  const snapshot = (await metricSnapshot(set)).map((sample) => ({ ...sample, groups: imageGroups(set, frame) }));
  const mask = { width: 2, height: 2, values: new Uint8Array([1, 1, 1, 1]) };
  const result = metricResult({
    width: 512,
    height: 512,
    detections: Array.from({ length: 300 }, () => ({
      label: 'Cup',
      score: 0.9,
      box: [0, 0, 1, 1],
      mask,
    })),
  });
  const measured = requirementMeasurements({
    task: { ...metricTask('segment'), requirements: [{ ...requirement, metric: 'mask-map' }] },
    snapshot,
    realTest: snapshot,
    rows: [{ frame, result }],
  });

  expect(measured[0]).toMatchObject({ reason: 'resources', score: null, support: 1 });
});

it('keeps a trained aggregate winner as a checkpoint when prediction evidence exceeds its resource bounds', async () => {
  const set = metricSet();

  set.conditions = ['night'];
  set.frames[0].conditions = ['night'];

  const evaluate = async (candidate: boolean) =>
    evaluateTraining({
      task: { ...metricTask(), requirements: [requirement] },
      sets: [set],
      snapshot: await metricSnapshot(set),
      realSourceIds: ['try:real'],
      modelHash: (candidate ? 'b' : 'c').repeat(64),
      modelBytes: 100,
      predictions: [
        {
          frameSetId: set.id,
          frameId: 'one',
          inferenceMs: 1,
          result: metricResult({
            detections: candidate
              ? [
                  {
                    ...metricResult().detections[0],
                    mask: {
                      width: 512,
                      height: 512,
                      values: Uint8Array.from(
                        { length: 512 * 512 },
                        (_, index) => ((index % 512) + Math.floor(index / 512)) % 2,
                      ),
                    },
                  },
                ]
              : [],
          }),
        },
      ],
    });
  const candidate = await evaluate(true);
  const incumbent = await evaluate(false);
  const compared = compare(candidate, incumbent);

  expect(candidate.metrics.primary).toBe(1);
  expect(incumbent.metrics.primary).toBe(0);
  expect(candidate.evidence).toBeUndefined();
  expect(compared.status).toBe('checkpoint');
  expect(compared.attempt.requirements![0].reason).toBe('resources');
});
