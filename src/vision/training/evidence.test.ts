import { describe, expect, it } from 'vitest';
import { evaluateTraining } from './metrics';
import { metricResult, metricSet, metricSnapshot, metricTask } from './metricsFixtures';
import { decodeEvidenceResult, validateEvidence, verifyEvidence, EVIDENCE_MAX_FRAMES } from './evidence';
import { comparisonImages, filterComparisonImages } from './inspection';
import type { TrainingKind } from './types';

const cases: { name: string; kind: TrainingKind; change: string; missed: number; extra: number }[] = [
  { name: 'missed person', kind: 'detect', change: 'missing', missed: 1, extra: 0 },
  { name: 'duplicate detection', kind: 'detect', change: 'duplicate', missed: 0, extra: 1 },
  { name: 'wrong object class', kind: 'detect', change: 'class', missed: 1, extra: 1 },
  { name: 'correct empty image', kind: 'detect', change: 'empty', missed: 0, extra: 0 },
  { name: 'localization error', kind: 'detect', change: 'location', missed: 1, extra: 1 },
  { name: 'mask boundary error', kind: 'segment', change: 'mask', missed: 1, extra: 1 },
  { name: 'missed visible keypoint', kind: 'keypoints', change: 'point', missed: 0, extra: 0 },
  { name: 'invisible keypoint', kind: 'keypoints', change: 'invisible', missed: 0, extra: 0 },
  { name: 'classification confusion', kind: 'classify', change: 'class', missed: 1, extra: 1 },
  { name: 'two-camera regression', kind: 'detect', change: 'camera', missed: 1, extra: 0 },
];

async function reports(kind: TrainingKind, change: string) {
  const set = metricSet();
  const task = metricTask(kind);

  if (change === 'missing') {
    set.classes[0].name = 'person';
    task.classes[0].name = 'person';
  }

  const good = metricResult({ classes: [{ label: set.classes[0].name, score: 1 }] });

  good.detections[0].label = set.classes[0].name;
  good.detections[0].mask = { width: 2, height: 2, values: new Uint8Array([1, 1, 1, 1]) };
  good.detections[0].keypoints = [[0.5, 0.5]];

  if (change === 'empty') set.frames[0].annotations = [];

  if (change === 'invisible') set.frames[0].annotations[0].keypoints[0].visible = false;

  const bad = structuredClone(good);

  if (['missing', 'empty', 'camera'].includes(change)) bad.detections = [];

  if (change === 'empty') good.detections = [];

  if (change === 'duplicate') bad.detections.push(structuredClone(bad.detections[0]));

  if (change === 'class') {
    bad.detections[0].label = 'Plate';
    bad.classes = [{ label: 'Plate', score: 1 }];
  }

  if (change === 'location') bad.detections[0].box = [0, 0, 0.1, 0.1];

  if (change === 'mask') bad.detections[0].mask!.values = new Uint8Array([1, 0, 0, 0]);

  if (['point', 'invisible'].includes(change)) bad.detections[0].keypoints = [[0, 0]];

  const sets = [set];

  if (change === 'camera') {
    const other = structuredClone(set);

    other.id = 'wrist-images';
    other.classes.reverse();
    other.frames[0].camera = 'wrist';
    sets.push(other);
  }

  const snapshot = (await Promise.all(sets.map(metricSnapshot))).flat();
  const evaluate = (result: typeof good, modelHash: string) =>
    evaluateTraining({
      task,
      sets,
      snapshot,
      realSourceIds: ['try:real'],
      predictions: sets.map((entry, index) => ({
        frameSetId: entry.id,
        frameId: 'one',
        result: index ? good : result,
        inferenceMs: 4,
      })),
      modelHash,
      modelBytes: 1024,
    });

  return { candidate: await evaluate(good, 'a'.repeat(64)), incumbent: await evaluate(bad, 'b'.repeat(64)), sets };
}

describe('frozen prediction evidence', () => {
  it.each(cases)('reconciles $name without independent image AP', async ({ kind, change, missed, extra }) => {
    const { candidate, incumbent } = await reports(kind, change);

    for (const report of [candidate, incumbent]) {
      validateEvidence(report);

      const restored = JSON.parse(JSON.stringify(report));

      validateEvidence(restored);
      expect(restored.evidence).toEqual(report.evidence);
      expect(report.evidence!.modelHash).toBe(report.modelHash);
      expect(report.evidence!.testHash).toBe(report.testHash);

      for (const category of report.metrics.perClass) {
        const rows = report.evidence!.frames.map((frame) =>
          frame.classes.find((row) => row.classId === category.classId)!,
        );

        for (const field of ['support', 'truePositive', 'falseNegative', 'falsePositive'] as const)
          expect(rows.reduce((sum, row) => sum + row[field], 0)).toBe(category[field]);

        expect(rows.every((row) => !Object.hasOwn(row, 'score'))).toBe(true);
      }
    }

    const failures = incumbent.evidence!.frames[0].classes;

    expect(failures.reduce((sum, row) => sum + row.falseNegative, 0)).toBe(missed);
    expect(failures.reduce((sum, row) => sum + row.falsePositive, 0)).toBe(extra);

    const images = comparisonImages(candidate, incumbent);

    expect(images).toHaveLength(change === 'camera' ? 2 : 1);
    expect(filterComparisonImages(images, { finding: 'improvements', classId: null })).toHaveLength(
      ['empty', 'invisible'].includes(change) ? 0 : 1,
    );
    expect(
      filterComparisonImages(comparisonImages(incumbent, candidate), { finding: 'regressions', classId: null }),
    ).toHaveLength(['empty', 'invisible'].includes(change) ? 0 : 1);

    if (kind === 'segment')
      expect(decodeEvidenceResult(incumbent.evidence!.frames[0].prediction).detections[0].mask!.values).toEqual(
        new Uint8Array([1, 0, 0, 0]),
      );

    if (kind === 'keypoints')
      expect(incumbent.evidence!.frames[0].classes[0].keypoints).toEqual({
        visible: change === 'invisible' ? 0 : 1,
        correct: 0,
      });
  });
});

describe('frozen evidence integrity and bounds', () => {
  it('refuses frame and byte limits before retaining incomplete evidence', async () => {
    const set = metricSet();
    const sample = (await metricSnapshot(set))[0];
    const input = {
      task: metricTask(),
      sets: [set],
      realSourceIds: ['try:real'],
      modelHash: 'a'.repeat(64),
      modelBytes: 100,
      snapshot: Array.from({ length: EVIDENCE_MAX_FRAMES + 1 }, (_, index) => ({
        ...sample,
        frameId: `image-${index}`,
      })),
      predictions: [],
    };

    await expect(evaluateTraining(input)).rejects.toThrow('at most 1,000');

    set.frames = Array.from({ length: 16 }, (_, index) => ({
      ...structuredClone(set.frames[0]),
      id: `image-${index}`,
    }));

    const task = metricTask('classify');

    task.classes = [
      task.classes[0],
      ...Array.from({ length: 999 }, (_, index) => ({ id: index + 100, name: `class-${index}-`.padEnd(200, 'x') })),
    ];

    await expect(
      evaluateTraining({
        ...input,
        task,
        snapshot: await metricSnapshot(set),
        predictions: set.frames.map((frame) => ({
          frameSetId: set.id,
          frameId: frame.id,
          inferenceMs: 1,
          result: metricResult({
            detections: [],
            classes: task.classes.map((category) => ({ label: category.name, score: 0.5 })),
          }),
        })),
      }),
    ).rejects.toThrow('3 MiB');
  });

  it('rejects changed identities, duplicate rows, corrupt predictions and diagnostics', async () => {
    const { candidate } = await reports('detect', 'missing');
    const mutations = [
      (report: typeof candidate) => {
        report.evidence!.modelHash = 'c'.repeat(64);
      },
      (report: typeof candidate) => {
        report.evidence!.testHash = 'c'.repeat(64);
      },
      (report: typeof candidate) => {
        report.evidence!.frames[0].sample.hash = 'c'.repeat(64);
      },
      (report: typeof candidate) => {
        report.evidence!.frames.push(report.evidence!.frames[0]);
      },
      (report: typeof candidate) => {
        report.evidence!.frames[0].prediction.detections[0].score = 2;
      },
      (report: typeof candidate) => {
        report.evidence!.frames[0].classes[0].falseNegative = 3;
      },
    ];

    for (const mutate of mutations) {
      const report = structuredClone(candidate);

      mutate(report);
      expect(() => validateEvidence(report)).toThrow();
    }
  });

  it('detects changed valid predictions even when aggregate counts still agree', async () => {
    const { candidate } = await reports('detect', 'missing');

    candidate.evidence!.frames[0].prediction.detections[0].score = 0.8;
    validateEvidence(candidate);
    await expect(verifyEvidence(candidate)).rejects.toThrow('evidence changed');
  });

  it('preserves old aggregate-only reports and refuses incomplete evidence', async () => {
    const { candidate, incumbent } = await reports('detect', 'missing');

    delete incumbent.evidence;
    validateEvidence(incumbent);
    expect(comparisonImages(candidate, incumbent)).toEqual([]);
    candidate.evidence!.frames = Array.from({ length: EVIDENCE_MAX_FRAMES + 1 }, () => candidate.evidence!.frames[0]);
    expect(() => validateEvidence(candidate)).toThrow();
  });
});
