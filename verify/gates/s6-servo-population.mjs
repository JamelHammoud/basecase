import { vitestCanary } from '../lib/canary.mjs';
import { shCheck, vitestCheck } from '../lib/gate.mjs';

const CANARIES = 'verify/skills/population-canaries.test.ts';

export default {
  id: 's6-servo-population',
  stage: 6,
  title: 'Stage 6: one servo model from many measured units',
  state: 'required',
  checks: [
    shCheck('Population unit tests pass', 'npx', [
      'vitest',
      'run',
      'src/reality/population.test.ts',
      'src/reality/calibratedInput.test.ts',
      'src/skills/servoDraws.test.ts',
      'src/skills/environment.test.ts',
    ]),
    vitestCheck(
      '24 fresh hidden units per family: a population from 16 holds at least 7 of the other 8 in its 90% band, and the median of all 24 replays 24 other fresh units closer than the preset',
      'verify/twin/population.test.ts',
    ),
  ],
  canaries: [
    vitestCanary(
      'a population with no spread fails the band',
      CANARIES,
      'canary narrow: a population with no spread holds 7 of 8 held-out units in its band',
    ),
    vitestCanary(
      'the preset fails to beat itself',
      CANARIES,
      'canary preset: the catalog preset replays held-out units closer than itself',
    ),
  ],
};
