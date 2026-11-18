import { expect, it } from 'vitest';
import { metricSet, metricTask, metricSnapshot, metricResult } from './metricsFixtures';
import { evaluateTraining } from './metrics';
import { compareTraining } from './retention';
import { preparationSources } from './prepareSources';
import { preparationTry } from './prepareFixtures';
import { imageGroups } from '../conditions';

it.each([1, 1 - 1e-6])(
  'accepts exactly permitted regression %s without hiding the aggregate score',
  async (maxRegression) => {
    const set = metricSet();

    set.conditions = ['night'];
    set.frames = [0, 1, 2].map((index) => ({
      ...structuredClone(set.frames[0]),
      id: `frame-${index}`,
      conditions: index === 2 ? ['night'] : [],
    }));

    const snapshot = await metricSnapshot(set);
    const task = {
      ...metricTask(),
      requirements: [
        {
          group: { kind: 'condition' as const, name: 'night' },
          metric: 'box-map' as const,
          minScore: 0,
          minRealTest: 1,
          maxRegression,
        },
      ],
    };
    const evaluate = (candidate: boolean) =>
      evaluateTraining({
        task,
        sets: [set],
        snapshot,
        realSourceIds: ['try:real'],
        modelHash: (candidate ? 'b' : 'c').repeat(64),
        modelBytes: 100,
        predictions: set.frames.map((frame, index) => ({
          frameSetId: set.id,
          frameId: frame.id,
          inferenceMs: 1,
          result: metricResult({ detections: (candidate ? index < 2 : index === 2) ? metricResult().detections : [] }),
        })),
      });
    const candidate = await evaluate(true);
    const incumbent = await evaluate(false);
    const compared = compareTraining({ id: 'boundary', at: '2026-11-17T12:00:00Z', candidate, incumbent, history: [] });

    expect(candidate.metrics.primary).toBeCloseTo(67 / 101, 10);
    expect(incumbent.metrics.primary).toBeCloseTo(34 / 101, 10);
    expect(compared.status).toBe(maxRegression === 1 ? 'retained' : 'checkpoint');
    expect(compared.attempt.requirements![0]).toMatchObject({
      candidate: 0,
      incumbent: 1,
      support: 1,
      reason: maxRegression === 1 ? 'passed' : 'regression',
    });
  },
);

it.each(['generated', 'unverified'] as const)('excludes %s provenance from requirement support', async (source) => {
  const set = metricSet();

  set.conditions = ['night'];
  set.frames[0].conditions = ['night'];

  if (source === 'unverified') delete set.frames[0].origin;

  const provenance = await preparationSources([set], async () => [{ ...preparationTry('real'), source: 'generated' }]);
  const snapshot = (await metricSnapshot(set)).map((sample) => ({
    ...sample,
    groups: imageGroups(set, set.frames[0]),
  }));
  const report = await evaluateTraining({
    task: {
      ...metricTask(),
      requirements: [
        {
          group: { kind: 'condition', name: 'night' },
          metric: 'box-map',
          minScore: 0,
          minRealTest: 1,
          maxRegression: 1,
        },
      ],
    },
    sets: [set],
    snapshot,
    realSourceIds: provenance.filter((entry) => entry.real).map((entry) => entry.source),
    predictions: [],
    modelHash: 'b'.repeat(64),
    modelBytes: 100,
  });

  expect(report.evidence?.requirements?.[0]).toMatchObject({ support: 0, score: null, reason: 'insufficient-support' });
});
