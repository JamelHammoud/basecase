import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import sharp from 'sharp';
import { freezeImages } from '../../datasets/snapshotImages';
import { datasetContentHash } from '../../datasets/contentHash';
import { frameSetHash } from '../frameSet';
import { objectMetrics } from './metricsObjects';
import { buildEvidence, EVIDENCE_MAX_BYTES, verifyEvidence } from './evidence';
import { metricResult, metricSet, metricTask } from './metricsFixtures';
import type { ImageDiagnostics } from './evidenceTypes';
import { canonicalTest } from './evaluationIdentity';
import { sha256 } from '../../cases/tries';
import { inspectionImage } from './inspectionImage';
import { evaluateTraining } from './metrics';

setFlagsFromString('--expose_gc');

const collect = runInNewContext('gc') as () => void;
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

async function resourcesFixture(size: number) {
  const set = metricSet();
  const jpeg = new Uint8Array(
    await sharp({ create: { width: 2, height: 2, channels: 3, background: 'white' } })
      .jpeg()
      .toBuffer(),
  );

  set.frames = Array.from({ length: size }, (_, index) => ({
    ...structuredClone(set.frames[0]),
    id: `image-${index}`,
    jpeg,
    split: 'test' as const,
  }));

  const content = new Map<string, Uint8Array>();
  const snapshot = await freezeImages(
    [{ frameSetId: set.id, frameIds: set.frames.map((frame) => frame.id), hash: await frameSetHash(set) }],
    async () => set,
    async (bytes) => {
      const hash = await datasetContentHash(bytes);

      content.set(hash, bytes);

      return hash;
    },
  );
  const input = {
    task: metricTask(),
    sets: [set],
    snapshot,
    realSourceIds: ['try:real'],
    modelHash: 'a'.repeat(64),
    modelBytes: 100,
    predictions: set.frames.map((frame) => ({
      frameSetId: set.id,
      frameId: frame.id,
      inferenceMs: 1,
      result: metricResult(),
    })),
  };

  return { input, content, testHash: await sha256(canonicalTest(snapshot)) };
}

async function measureEvidence(fixture: Awaited<ReturnType<typeof resourcesFixture>>) {
  const { input, testHash } = fixture;
  const rows = input.sets[0].frames.map((frame, index) => ({ frame, result: input.predictions[index].result }));
  const before = performance.now();
  const baseline = objectMetrics(rows, input.task);
  const baselineMs = performance.now() - before;

  collect();

  const heapBefore = process.memoryUsage().heapUsed;
  const diagnostics: ImageDiagnostics[][] = rows.map(() => []);
  const started = performance.now();
  const aggregate = objectMetrics(rows, input.task, diagnostics);
  const evidence = await buildEvidence({ input, realTest: input.snapshot, testHash, diagnostics });
  const evidenceMs = performance.now() - started;

  collect();

  const retainedHeapBytes = process.memoryUsage().heapUsed - heapBefore;
  const serializedBytes = new TextEncoder().encode(JSON.stringify(evidence)).byteLength;

  expect(aggregate).toEqual(baseline);
  expect(serializedBytes).toBeLessThanOrEqual(EVIDENCE_MAX_BYTES);
  expect(evidence.frames).toHaveLength(input.snapshot.length);

  return { baselineMs, evidenceMs, addedMs: evidenceMs - baselineMs, retainedHeapBytes, serializedBytes };
}

describe('bounded evidence resources', () => {
  it.each([4, 1000])('retains complete diagnostics and restores one frozen image at %s images', async (size) => {
    const fixture = await resourcesFixture(size);
    const observations = [];

    await measureEvidence(fixture);

    for (let trial = 0; trial < 5; trial++) observations.push(await measureEvidence(fixture));

    const report = await evaluateTraining(fixture.input);
    const frame = report.evidence!.frames[0];
    const started = performance.now();

    await verifyEvidence(report);

    const image = await inspectionImage({
      sample: frame.sample,
      bytes: fixture.content.get(frame.sample.content)!,
      candidate: frame.prediction,
      incumbent: frame.prediction,
      task: report.task,
    });
    const inspectionMs = performance.now() - started;

    expect(image.set.frames).toHaveLength(1);
    expect(image.set.frames[0].jpeg).toEqual(fixture.input.sets[0].frames[0].jpeg);

    const measurement = {
      evidenceResources: size,
      inspectionMs,
      baselineMs: median(observations.map((row) => row.baselineMs)),
      evidenceMs: median(observations.map((row) => row.evidenceMs)),
      addedMs: median(observations.map((row) => row.addedMs)),
      retainedHeapBytes: median(observations.map((row) => row.retainedHeapBytes)),
      serializedBytes: observations[0].serializedBytes,
    };

    mkdirSync('scratch', { recursive: true });
    writeFileSync(`scratch/vision-evidence-resources-${size}.json`, JSON.stringify(measurement, null, 2));
  });
});
