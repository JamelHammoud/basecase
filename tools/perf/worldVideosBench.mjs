import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { offscreenWorker } from '../testing/offscreenWorker.ts';

const result = await offscreenWorker(
  fileURLToPath(new URL('../../src/datasets/worldRenderBenchmark.ts', import.meta.url)),
  'worldRenderBenchmark',
);

console.log(JSON.stringify(result, null, 2));
assert(result.box.bytes > 0);
assert(result.kitchen.bytes > 0);
assert(result.ratio <= 3, JSON.stringify(result));
