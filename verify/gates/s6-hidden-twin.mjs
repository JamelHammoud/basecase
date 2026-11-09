import { vitestCanary } from '../lib/canary.mjs';
import { shCheck, vitestCheck } from '../lib/gate.mjs';

const CANARIES = 'verify/twin/canaries.test.ts';

export default {
  id: 's6-hidden-twin',
  stage: 6,
  title: 'Stage 6: calibration against a hidden twin the builder never sees',
  state: 'required',
  checks: [
    vitestCheck(
      'the twin is fair: fresh hidden units per run, and their true in-model parameters reach the bar without the alarm',
      'verify/twin/twin.test.ts',
    ),
    vitestCheck(
      '24 hidden units per family: median held-out error down 25%, bootstrap CI above zero; shuffled logs fail; preset logs read consistent',
      'verify/twin/calibration.test.ts',
    ),
    shCheck('Calibration unit tests pass', 'npx', ['vitest', 'run', 'src/reality']),
    shCheck('Types hold', 'npx', ['tsc', '-b']),
  ],
  canaries: [
    vitestCanary(
      'a no-op calibrator fails the bar',
      CANARIES,
      'canary no-op: a calibrator that returns the preset meets the bar',
    ),
    vitestCanary(
      'a twin inside the training model raises the alarm',
      CANARIES,
      'canary in-class: a twin inside the training model class, fitted exactly, raises no alarm',
    ),
    vitestCanary(
      'gains that straddle zero fail the bootstrap',
      CANARIES,
      'canary straddle: gains that straddle zero clear the bootstrap',
    ),
    vitestCanary('fewer than 20 units fail', CANARIES, 'canary few units: 12 hidden units are enough'),
  ],
};
