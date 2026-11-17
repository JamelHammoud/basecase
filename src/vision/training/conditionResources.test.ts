import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import sharp from 'sharp';
import { metricResult, metricSet, metricTask } from './metricsFixtures';
import { frameSetHash } from '../frameSet';
import { packImageSnapshots } from '../imageSnapshot';
import { datasetContentHash } from '../../datasets/contentHash';
import { evaluateTraining } from './metrics';
import { evaluateImageGroup } from './conditionEvaluation';

setFlagsFromString('--expose_gc');

const collect = runInNewContext('gc') as () => void;

async function fixture(count: number) {
  const set = metricSet();
  const jpeg = new Uint8Array(
    await sharp({ create: { width: 2, height: 2, channels: 3, background: 'white' } })
      .jpeg()
      .toBuffer(),
  );

  set.conditions = ['glare', 'empty'];
  set.frames = Array.from({ length: count }, (_, index) => ({
    ...structuredClone(set.frames[0]),
    id: `image-${index}`,
    jpeg,
    conditions: ['glare'],
    split: 'test',
  }));

  const member = { frameSetId: set.id, frameIds: set.frames.map((frame) => frame.id), hash: await frameSetHash(set) };
  const packed = await packImageSnapshots(set, member);
  const content = new Map<string, Uint8Array>();
  const snapshot = [];

  for (const { sample, bytes } of packed) {
    const hash = await datasetContentHash(bytes);

    content.set(hash, bytes);
    snapshot.push({ ...sample, content: hash });
  }

  const report = await evaluateTraining({
    task: metricTask(),
    sets: [set],
    snapshot,
    realSourceIds: ['try:real'],
    predictions: set.frames.map((frame) => ({
      frameSetId: set.id,
      frameId: frame.id,
      result: metricResult(),
      inferenceMs: 1,
    })),
    modelHash: 'b'.repeat(64),
    modelBytes: 100,
  });

  return { report, load: async (hash: string) => content.get(hash) ?? null };
}

describe('bounded condition evaluation resources', () => {
  it.each([4, 1000])(
    'rescores %s retained predictions without inference or extra retained image content',
    async (count) => {
      const { report, load } = await fixture(count);
      const input = { candidate: report, incumbent: report, group: { kind: 'condition' as const, name: 'glare' } };

      await evaluateImageGroup(input, load);
      collect();

      const heapBefore = process.memoryUsage().heapUsed;
      const start = performance.now();
      const result = await evaluateImageGroup(input, load);
      const elapsedMs = performance.now() - start;

      collect();

      const retainedHeapBytes = process.memoryUsage().heapUsed - heapBefore;
      const resultBytes = Buffer.byteLength(JSON.stringify(result));

      expect(result.support.realTest).toBe(count);
      expect(result.candidate.primary).toBe(1);
      expect(result.incumbent.primary).toBe(1);
      expect(resultBytes).toBeLessThan(64 * 1024);
      mkdirSync('scratch', { recursive: true });
      writeFileSync(
        `scratch/vision-condition-resources-${count}.json`,
        JSON.stringify(
          {
            count,
            elapsedMs,
            evidenceBytesPerModel: Buffer.byteLength(JSON.stringify(report.evidence)),
            resultBytes,
            retainedHeapBytes,
          },
          null,
          2,
        ),
      );
    },
  );
});
