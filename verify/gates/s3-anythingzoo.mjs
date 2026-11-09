import { vitestCanary } from '../lib/canary.mjs';
import { shCheck, vitestCheck } from '../lib/gate.mjs';
import { zooCheck, zooRun } from '../zoo/gate.mjs';

const CANARIES = 'verify/zoo/canaries.test.ts';
const run = zooRun('sample');
const timed = (check) => ({ ...check, timed: true });

export default {
  id: 's3-anythingzoo',
  stage: 3,
  title: 'Stage 3: the AnythingZoo, a stratified sample of 20 task and body pairs on this Mac',
  state: 'required',
  checks: [
    vitestCheck(
      'the gate-side generator draws 30 tasks on 6 bodies, hidden judges no robot at rest or limp can meet, labelled rollouts both ways',
      'verify/zoo/generator.test.ts',
    ),
    shCheck('forge-train builds', 'cargo', [
      'build',
      '--release',
      '--manifest-path',
      'forge/Cargo.toml',
      '-p',
      'forge-train',
    ]),
    timed(
      zooCheck(
        'prompt to skill on 20 stratified pairs, approved by the stand-in, judged by hidden Arena, alternatives timed',
        run,
        'verify/zoo/zoo.test.ts',
      ),
    ),
    zooCheck(
      'at least 70% of feasible non-deformable pairs pass hidden Arena in budget; no false pass claims; deformables unverifiable; router within 2x of the cheapest on 80%',
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
      'a skill claimed for a deformable task is caught',
      CANARIES,
      'canary deformable claim: a skill claimed for folding a towel passes',
    ),
    vitestCanary(
      'the stand-in rejects a contract that passes everything',
      CANARIES,
      'canary rubber stamp: a contract that passes everything is approved',
    ),
    vitestCanary(
      'giving up everywhere misses the 70% bar',
      CANARIES,
      'canary give-up: honest not-found on every feasible pair meets the pass bar',
    ),
    vitestCanary(
      'a slow router misses the 80% bar',
      CANARIES,
      'canary lazy router: a router slower than 2x the cheapest on most pairs passes',
    ),
    vitestCanary(
      'a log that prints a hidden contract is caught',
      CANARIES,
      'canary leak: a log that prints a hidden contract is clean',
    ),
    vitestCanary(
      'a hidden judge met by standing still is refused',
      CANARIES,
      'canary free pass: a hidden judge that standing still meets is accepted',
    ),
  ],
};
