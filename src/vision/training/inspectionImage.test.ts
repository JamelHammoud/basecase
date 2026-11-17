import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { FrozenComparisonImage } from '../../components/visionLabels/FrozenComparisonImage';
import { datasetContentHash } from '../../datasets/contentHash';
import { frameSetHash } from '../frameSet';
import { packImageSnapshots } from '../imageSnapshot';
import { inspectionImage } from './inspectionImage';
import { evaluateTraining } from './metrics';
import { metricResult, metricSet, metricTask } from './metricsFixtures';
import type { TrainingKind } from './types';
import type { VisionDetection } from '../types';

async function displayedPrediction(kind: TrainingKind, detections: VisionDetection[]) {
  const set = metricSet();
  const [{ sample, bytes }] = await packImageSnapshots(set, {
    frameSetId: set.id,
    frameIds: [set.frames[0].id],
    hash: await frameSetHash(set),
  });
  const frozen = { ...sample, split: 'test' as const, content: await datasetContentHash(bytes) };
  const task = metricTask(kind);
  const report = await evaluateTraining({
    task,
    sets: [set],
    snapshot: [frozen],
    realSourceIds: [frozen.source],
    predictions: [
      { frameSetId: set.id, frameId: sample.frameId, result: metricResult({ detections }), inferenceMs: 1 },
    ],
    modelHash: 'a'.repeat(64),
    modelBytes: 100,
  });
  const prediction = report.evidence!.frames[0].prediction;
  const image = await inspectionImage({ sample: frozen, bytes, candidate: prediction, incumbent: prediction, task });

  return { report, image };
}

describe('frozen inspection display semantics', () => {
  it.each([
    { name: 'absent', mask: undefined },
    { name: 'empty', mask: { width: 2, height: 2, values: new Uint8Array(4) } },
    {
      name: 'empty after resizing',
      mask: { width: 4, height: 4, values: new Uint8Array([1, ...new Array(15).fill(0)]) },
    },
  ])('keeps $name masks in diagnostics without hiding the historical image', async ({ mask }) => {
    const detection = metricResult().detections[0];
    const goodMask = { width: 2, height: 2, values: new Uint8Array([1, 1, 1, 1]) };
    const { report, image } = await displayedPrediction('segment', [
      { ...detection, mask },
      { ...detection, mask: goodMask },
    ]);

    expect(report.evidence!.frames[0].prediction.detections).toHaveLength(2);
    expect(report.evidence!.frames[0].classes[0]).toMatchObject({ truePositive: 1, falsePositive: 1 });
    expect(image.set.frames[0].annotations).toHaveLength(1);
    expect(image.candidate).toHaveLength(1);
    expect(image.incumbent).toHaveLength(1);
    expect(image.candidate[0].polygons).toEqual([[0, 0, 2, 0, 2, 2, 0, 2]]);
  });

  it.each(['detect', 'segment', 'keypoints'] as const)(
    'shows evaluated keypoints only for the %s task',
    async (kind) => {
      const { image } = await displayedPrediction(kind, [
        {
          ...metricResult().detections[0],
          keypoints: [[0.25, 0.5]],
          mask: { width: 2, height: 2, values: new Uint8Array([1, 1, 1, 1]) },
        },
      ]);
      const markup = renderToStaticMarkup(
        createElement(FrozenComparisonImage, { image, overlay: 'candidate', classification: false }),
      );
      const circles = [...markup.matchAll(/<circle[^>]*fill="([^"]+)"/g)].map((match) => match[1]);

      expect(circles).toEqual(kind === 'keypoints' ? ['#fff', '#0d99ff'] : []);
      expect(markup).not.toContain('data-corner');
      expect(markup).not.toContain('data-vertex');
    },
  );
});
