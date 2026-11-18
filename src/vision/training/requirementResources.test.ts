import { compareTraining } from './retention';
import { expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { metricResult, metricSet, metricTask, metricSnapshot } from './metricsFixtures';
import { evaluateTraining, evaluatedRows } from './metrics';
import { requirementMeasurements } from './requirementEvaluation';
import type { TrainingEvaluationInput } from './types';

setFlagsFromString('--expose_gc');

const collect = runInNewContext('gc') as () => void;

it.each([4, 1000])(
  'measures %s images with shared rows, bounded retained indices and no content reads',
  async (count) => {
    const set = metricSet();

    set.conditions = ['night', 'glare'];
    set.frames = Array.from({ length: count }, (_, index) => ({
      ...structuredClone(set.frames[0]),
      id: `frame-${index}`,
      conditions: ['night', 'glare'],
    }));

    const task = {
      ...metricTask(),
      requirements: ['night', 'glare'].map((name) => ({
        group: { kind: 'condition' as const, name },
        metric: 'box-map' as const,
        minScore: 1,
        minRealTest: count,
        maxRegression: 0,
      })),
    };
    const input: TrainingEvaluationInput = {
      task,
      sets: [set],
      snapshot: await metricSnapshot(set),
      realSourceIds: ['try:real'],
      predictions: set.frames.map((frame) => ({
        frameSetId: set.id,
        frameId: frame.id,
        result: metricResult(),
        inferenceMs: 1,
      })),
      modelHash: 'b'.repeat(64),
      modelBytes: 100,
    };
    const baseline = await evaluateTraining({ ...input, task: metricTask() });
    const times = [];
    let measured = baseline;

    await evaluateTraining(input);
    collect();

    const heapBefore = process.memoryUsage().heapUsed;
    let peakRssBytes = process.memoryUsage().rss;

    for (let at = 0; at < 5; at++) {
      const start = performance.now();

      await evaluateTraining({ ...input, task: metricTask() });

      const plainMs = performance.now() - start;
      const withStart = performance.now();

      measured = await evaluateTraining(input);
      times.push({ plainMs, requiredMs: performance.now() - withStart });
      peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
    }

    collect();

    const heapBytes = process.memoryUsage().heapUsed - heapBefore;
    const retainedBytes = Buffer.byteLength(JSON.stringify(measured)) - Buffer.byteLength(JSON.stringify(baseline));

    const storedBytes = (report: typeof baseline) =>
      Buffer.byteLength(
        JSON.stringify({
          report,
          incumbentReport: report,
          comparison: compareTraining({
            id: 'resources',
            at: '2026-11-17T12:00:00Z',
            candidate: report,
            incumbent: report,
            history: [],
          }).attempt,
        }),
      );
    const comparisonAddedBytes = storedBytes(measured) - storedBytes(baseline);

    expect(measured.metrics).toEqual(baseline.metrics);
    expect(measured.evidence?.requirements?.every((row) => row.support === count && row.score === 1)).toBe(true);
    expect(retainedBytes).toBeLessThan(24 * 1024);
    mkdirSync('scratch', { recursive: true });
    writeFileSync(
      `scratch/vision-requirement-resources-${count}.json`,
      JSON.stringify(
        {
          count,
          times,
          heapBytes,
          peakRssBytes,
          retainedBytes,
          comparisonAddedBytes,
          addedInference: 0,
          addedContentReads: 0,
          addedDecodedImagePixels: 0,
          scoredImagePixels: count * 4 * 2,
        },
        null,
        2,
      ),
    );

    const rows = await evaluatedRows(input, baseline.realTest);

    rows[0].frame.width = 4096;
    rows[0].frame.height = 4096;

    expect(
      requirementMeasurements({ task, rows, realTest: baseline.realTest, snapshot: measured.snapshot }).every(
        (row) => row.reason === 'resources' && row.score === null,
      ),
    ).toBe(true);
  },
);
