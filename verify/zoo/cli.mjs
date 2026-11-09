import { parseArgs } from 'node:util';
import { zooCheck, zooRun } from './gate.mjs';

const { values } = parseArgs({
  options: {
    sample: { type: 'boolean', default: false },
    full: { type: 'boolean', default: false },
    shard: { type: 'string', default: '0/1' },
    seed: { type: 'string' },
    verdict: { type: 'boolean', default: false },
  },
});

if (values.seed) process.env.ZOO_SEED = values.seed;

process.env.ZOO_SHARD = values.shard;

const run = zooRun(values.full ? 'full' : 'sample');
const file = values.verdict ? 'verify/zoo/verdict.test.ts' : 'verify/zoo/zoo.test.ts';
const result = zooCheck(`AnythingZoo ${values.full ? 'full' : 'sample'}`, run, file).run();

console.log(`${result.ok ? 'PASS' : 'FAIL'} ${run.dir}\n${result.detail}`);
process.exit(result.ok ? 0 : 1);
