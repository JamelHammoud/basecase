import { vitestCanary } from '../lib/canary.mjs';
import { vitestCheck } from '../lib/gate.mjs';
import { zooCheck, zooRun } from '../zoo/gate.mjs';

const CANARIES = 'verify/zoo/canaries.test.ts';
const run = zooRun('full');

export default {
  id: 's3-anythingzoo-full',
  stage: 3,
  title: 'Stage 3: the full AnythingZoo, all 180 task and body pairs, on rented machines',
  state: 'parked',
  parked:
    'About 225 machine-hours per round. Runs on rented machines: give every machine the same ZOO_SEED and its own ZOO_SHARD (i/n), copy every shard’s verify/out/zoo/full-<seed> results into one folder, then run the verdict there.',
  checks: [
    vitestCheck('the gate-side generator draws every pair', 'verify/zoo/generator.test.ts'),
    { ...zooCheck('prompt to skill on every pair of this shard', run, 'verify/zoo/zoo.test.ts'), timed: true },
    zooCheck(
      'at least 70% of the 81 feasible non-deformable pairs pass hidden Arena in budget; no false pass claims; router within 2x on 80%',
      run,
      'verify/zoo/verdict.test.ts',
    ),
  ],
  canaries: [
    vitestCanary(
      'a do-nothing skill claimed as passing is a false claim',
      CANARIES,
      'canary limp claim: a do-nothing skill claimed as passing is not a false claim',
    ),
    vitestCanary(
      'giving up everywhere misses the 70% bar',
      CANARIES,
      'canary give-up: honest not-found on every feasible pair meets the pass bar',
    ),
  ],
};
