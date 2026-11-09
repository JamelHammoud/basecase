import path from 'node:path';
import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { repoPath } from '../lib/need';
import { loadAnything, type AnythingModule } from './anything';
import { generatePair, PoserPool, stratifiedSample, zooGrid, type PairRef, type ZooPair } from './generator';
import { freshSeed } from './rng';
import { runPair, secretsOf, writeJson } from './run';

const PAIR_TIMEOUT_MS = 6 * 60 * 60 * 1000;

const mode = process.env.ZOO_MODE === 'full' ? 'full' : 'sample';
const seed = process.env.ZOO_SEED ?? freshSeed();
const runDir = process.env.ZOO_RUN_DIR ?? repoPath('verify', 'out', 'zoo', `${mode}-${seed.slice(0, 12)}`);
const [shardIndex, shardCount] = (process.env.ZOO_SHARD ?? '0/1').split('/').map(Number);

const refs: PairRef[] = (mode === 'full' ? zooGrid() : stratifiedSample(seed)).filter(
  (_, i) => i % shardCount === shardIndex,
);

let mj: MainModule;
let anything: AnythingModule;
let pool: PoserPool;
const pairs: ZooPair[] = [];

beforeAll(async () => {
  writeJson(path.join(runDir, 'plan.json'), { mode, refs: refs.length, shard: `${shardIndex}/${shardCount}` });
  anything = await loadAnything();
  mj = await loadMujoco();
  pool = new PoserPool(mj);

  for (const ref of refs) pairs.push(await generatePair(mj, seed, ref, pool));

  writeJson(path.join(runDir, 'secrets.json'), secretsOf(seed, pairs));
  writeJson(path.join(runDir, `pairs-${shardIndex}.json`), pairs);
}, 1_800_000);

afterAll(() => {
  pool?.dispose();
});

describe(`the AnythingZoo, ${mode}`, () => {
  refs.forEach((_, i) => {
    it(
      `pair ${i + 1} of ${refs.length}`,
      async () => {
        const pair = pairs[i];
        const result = await runPair({ mj, pair, anything, pool, outDir: runDir });

        writeJson(path.join(runDir, 'results', `${pair.id}.json`), result);
        expect(result.id).toBe(pair.id);
      },
      PAIR_TIMEOUT_MS,
    );
  });
});
