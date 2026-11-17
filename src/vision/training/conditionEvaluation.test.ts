import { describe, expect, it } from 'vitest';
import { metricReport, metricResult, metricSet, metricTask } from './metricsFixtures';
import { evaluateTraining } from './metrics';
import { evaluateImageGroup, frozenImageGroups } from './conditionEvaluation';
import { packImageSnapshots } from '../imageSnapshot';
import { frameSetHash } from '../frameSet';
import { datasetContentHash } from '../../datasets/contentHash';
import type { TrainingKind, TrainingPrediction } from './types';
import { compareTraining } from './retention';
import { imageGroupsHash } from './evidence';
import { sha256 } from '../../cases/tries';

async function fixture(kind: TrainingKind = 'detect') {
  const set = metricSet();

  set.conditions = ['day', 'night', 'glare', 'empty'];
  set.frames = Array.from({ length: 5 }, (_, index) => ({
    ...structuredClone(set.frames[0]),
    id: `frame-${index}`,
    camera: index === 2 ? 'wrist' : 'front',
    conditions: [['day'], ['day', 'glare'], ['night', 'glare'], ['night'], []][index],
    origin: { tryId: ['real', 'real', 'real', 'synthetic', 'training'][index], frame: index, seconds: index },
    split: index === 4 ? 'train' : 'test',
  }));

  const member = { frameSetId: set.id, frameIds: set.frames.map((frame) => frame.id), hash: await frameSetHash(set) };
  const packed = await packImageSnapshots(set, member);
  const blobs = new Map<string, Uint8Array>();
  const snapshot = await Promise.all(
    packed.map(async ({ sample, bytes }) => {
      const content = await datasetContentHash(bytes);

      blobs.set(content, bytes);

      return { ...sample, content };
    }),
  );
  const task = metricTask(kind);
  const report = async (candidate: boolean) => {
    const predictions: TrainingPrediction[] = set.frames.slice(0, 3).map((frame, index) => {
      const correct = candidate ? index < 2 : index === 2;
      const result = metricResult({
        detections: correct
          ? [
              {
                label: 'Cup',
                score: 0.9,
                box: [0, 0, 1, 1],
                keypoints: [[0.5, 0.5]],
                mask: { width: 2, height: 2, values: new Uint8Array([1, 1, 1, 1]) },
              },
            ]
          : [],
        ...(kind === 'classify' ? { classes: [{ label: correct ? 'Cup' : 'Plate', score: 0.9 }] } : {}),
      });

      return { frameSetId: set.id, frameId: frame.id, result, inferenceMs: 1 };
    });

    return evaluateTraining({
      task,
      sets: [set],
      snapshot,
      realSourceIds: ['try:real'],
      predictions,
      modelHash: (candidate ? 'b' : 'c').repeat(64),
      modelBytes: 100,
    });
  };

  return {
    candidate: await report(true),
    incumbent: await report(false),
    load: async (hash: string) => blobs.get(hash) ?? null,
    set,
    blobs,
  };
}

describe('frozen condition evaluation', () => {
  it('captures automatic camera groups without adding metadata to an unlabelled dataset', async () => {
    const candidate = await metricReport();

    expect(frozenImageGroups(candidate).find((group) => group.kind === 'camera')).toMatchObject({
      name: 'camera',
      realTest: 1,
      unlabeled: 1,
    });
    expect(metricSet()).not.toHaveProperty('conditions');
  });

  it.each(['detect', 'segment', 'keypoints', 'classify'] as const)(
    'recomputes %s on exact members while the aggregate winner regresses at night',
    async (kind) => {
      const { candidate, incumbent, load } = await fixture(kind);
      const night = await evaluateImageGroup(
        { candidate, incumbent, group: { kind: 'condition', name: 'night' } },
        load,
      );
      const day = await evaluateImageGroup({ candidate, incumbent, group: { kind: 'condition', name: 'day' } }, load);

      expect(night.support.keys).toEqual(['images:frame-2']);
      expect(night.support).toMatchObject({ members: 2, realTest: 1, otherTest: 1, otherSplits: 0, overlapping: 1 });
      expect(night.candidate.primary).toBe(0);
      expect(night.incumbent.primary).toBe(1);
      expect(day.support.keys).toEqual(['images:frame-0', 'images:frame-1']);
      expect(day.candidate.primary).toBe(1);
      expect(day.incumbent.primary).toBe(0);
      expect(candidate.metrics.primary).toBeCloseTo(['detect', 'segment'].includes(kind) ? 67 / 101 : 2 / 3);
      expect(incumbent.metrics.primary).toBeCloseTo(['detect', 'segment'].includes(kind) ? 34 / 101 : 1 / 3);
      expect(
        compareTraining({ candidate, incumbent, id: 'comparison', at: '2026-11-17T00:00:00Z', history: [] }).status,
      ).toBe('retained');
      expect(day.candidate.perClass[0]).toMatchObject({
        support: 2,
        truePositive: 2,
        falsePositive: 0,
        falseNegative: 0,
      });
    },
  );

  it('keeps empty, overlapping, camera and source groups distinct and counts missing labels', async () => {
    const { candidate, incumbent, load } = await fixture();
    const groups = frozenImageGroups(candidate);

    expect(groups.find((group) => group.name === 'glare')).toMatchObject({ realTest: 2, overlapping: 2 });
    expect(groups.find((group) => group.name === 'front')).toMatchObject({ members: 4, realTest: 2, unlabeled: 1 });
    expect(groups.find((group) => group.name === 'try:synthetic')).toMatchObject({ realTest: 0, otherTest: 1 });

    const empty = await evaluateImageGroup({ candidate, incumbent, group: { kind: 'condition', name: 'empty' } }, load);
    const synthetic = await evaluateImageGroup(
      { candidate, incumbent, group: { kind: 'source', name: 'try:synthetic' } },
      load,
    );

    expect(empty.support.members).toBe(0);
    expect(empty.candidate.primary).toBeNull();
    expect(empty.incumbent.primary).toBeNull();
    expect(synthetic.candidate.primary).toBeNull();
    expect(synthetic.incumbent.primary).toBeNull();
  });

  it('preserves a reopened report after current membership edits and refuses changed frozen metadata and bytes', async () => {
    const { candidate, incumbent, load, set } = await fixture();
    const saved = JSON.stringify({ candidate, incumbent });
    const reopened = JSON.parse(saved) as { candidate: typeof candidate; incumbent: typeof incumbent };

    set.frames[2].conditions = ['day'];
    expect(
      (await evaluateImageGroup({ ...reopened, group: { kind: 'condition', name: 'night' } }, load)).candidate.primary,
    ).toBe(0);
    expect(JSON.stringify(reopened)).toBe(saved);
    reopened.candidate.snapshot[2].groups!.labels = ['day'];
    await expect(
      evaluateImageGroup({ ...reopened, group: { kind: 'condition', name: 'night' } }, load),
    ).rejects.toThrow('groups changed');
    await expect(
      evaluateImageGroup(
        { candidate, incumbent, group: { kind: 'condition', name: 'day' } },
        async () => new Uint8Array([0]),
      ),
    ).rejects.toThrow('content changed');
  });

  it('does not invent subgroup scores for historical reports without bound group evidence', async () => {
    const { candidate, incumbent, load } = await fixture();

    candidate.evidence = undefined;
    incumbent.evidence = undefined;
    expect(frozenImageGroups(candidate)).toEqual([]);
    await expect(
      evaluateImageGroup({ candidate, incumbent, group: { kind: 'condition', name: 'day' } }, load),
    ).rejects.toThrow('unavailable');
  });

  it('checks declared membership against the archived frame even when metadata digests are recomputed', async () => {
    const { candidate, incumbent, load } = await fixture();

    for (const report of [candidate, incumbent]) {
      report.snapshot[2].groups!.labels = ['day'];
      report.evidence!.groupsHash = await imageGroupsHash(report.snapshot);
      report.evidence!.hash = await sha256(JSON.stringify({ ...report.evidence, hash: '' }));
    }

    await expect(
      evaluateImageGroup({ candidate, incumbent, group: { kind: 'condition', name: 'day' } }, load),
    ).rejects.toThrow('content changed');
  });

  it('bounds evaluation pixels before asking the content store to restore any member', async () => {
    const { candidate, incumbent } = await fixture();
    let reads = 0;

    for (const report of [candidate, incumbent]) {
      report.evidence!.frames[0].prediction.width = 8192;
      report.evidence!.frames[0].prediction.height = 8192;
      report.evidence!.hash = await sha256(JSON.stringify({ ...report.evidence, hash: '' }));
    }

    await expect(
      evaluateImageGroup({ candidate, incumbent, group: { kind: 'condition', name: 'day' } }, async () => {
        reads++;

        return null;
      }),
    ).rejects.toThrow('32 million');
    expect(reads).toBe(0);
  });
});
