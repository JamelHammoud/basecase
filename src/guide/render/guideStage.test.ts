import path from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { openOffscreenWorker, type OffscreenTestWorker } from '../../../tools/testing/offscreenWorker';
import { probeGuideStage } from './guideStage.fixtures';

const abort = new AbortController();
let worker: OffscreenTestWorker | undefined;
let setup: Promise<void>;

beforeAll(() => {
  setup = openOffscreenWorker(path.resolve('src/guide/render/guideStage.fixtures.ts'), probeGuideStage.name, {
    signal: abort.signal,
    timeout: 15000,
  }).then((opened) => {
    worker = opened;
  });

  return setup;
}, 15000);

afterAll(async () => {
  abort.abort();
  await setup?.catch(() => undefined);
  await worker?.close();
});

it.each([0, Math.PI / 3, -Math.PI / 4])(
  'retains guide pixels and visibility with fewer draw calls at view %s',
  async (angle) => {
    const result = await worker!.run<{
      counts: number[];
      compileRefused: boolean;
      unchanged: boolean;
      shaderParity: boolean;
      usesOptimized: boolean;
      disposals: number;
      drawCalls: number;
      referenceCalls: number;
    }>(angle);

    expect(result.compileRefused).toBe(true);
    expect(result.counts[0]).toBeGreaterThan(0);
    expect(result.counts[1]).toBe(result.counts[0]);
    expect(result.unchanged).toBe(true);
    expect(result.shaderParity).toBe(true);
    expect(result.usesOptimized).toBe(true);
    expect(result.disposals).toBe(0);
    expect(result.drawCalls).toBeLessThan(result.referenceCalls);
  },
);
