import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { stratifiedSample, zooGrid, pairId } from './generator';
import { readJson, writeJson } from './run';
import { zooVerdict, type PairResult } from './score';

const runDir = process.env.ZOO_RUN_DIR ?? '';
const seed = process.env.ZOO_SEED ?? '';
const mode = process.env.ZOO_MODE === 'full' ? 'full' : 'sample';

describe(`AnythingZoo verdict, ${mode}`, () => {
  it('at least 70% of non-deformable feasible pairs pass hidden Arena in budget, no false claims, router within 2x on 80%', () => {
    if (!runDir || !seed) throw new Error('setup: ZOO_RUN_DIR and ZOO_SEED come from the gate');

    const expected = (mode === 'full' ? zooGrid() : stratifiedSample(seed)).map(pairId);
    const dir = path.join(runDir, 'results');
    const results = expected.flatMap((id) => {
      const file = path.join(dir, `${id}.json`);

      return fs.existsSync(file) ? [readJson<PairResult>(file)] : [];
    });
    const verdict = zooVerdict(results, expected.length);

    writeJson(path.join(runDir, 'verdict.json'), verdict);
    expect(verdict.problems).toEqual([]);
  });
});
