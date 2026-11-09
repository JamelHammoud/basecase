import { vitestCanary } from '../lib/canary.mjs';
import { vitestCheck } from '../lib/gate.mjs';

const CANARIES = 'verify/twin/canaries.test.ts';

export default {
  id: 's6-hidden-twin-nad',
  stage: 6,
  title: 'Stage 6: leave-one-payload-out on public SO-101 logs (NAD), and the twin anchored to them',
  state: 'parked',
  parked:
    'The NAD SO-101 logs (goal, position, load, voltage, payloads) could not be located as a public download. A maintainer pins the URL, sha256 and a reader in verify/twin/nad.json; no data is faked in the meantime.',
  checks: [
    vitestCheck(
      'leave one payload out: calibrated sim within half the teleport error and under a fitted FOPD, per joint; the twin’s gap to the sim within 0.5x to 2x of the real gap',
      'verify/twin/nad.test.ts',
    ),
  ],
  canaries: [
    vitestCanary(
      'a no-op calibrator fails the bar',
      CANARIES,
      'canary no-op: a calibrator that returns the preset meets the bar',
    ),
  ],
};
