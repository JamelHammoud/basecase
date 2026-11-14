import { vitestCanary } from '../lib/canary.mjs';
import { shCheck, vitestCheck } from '../lib/gate.mjs';

const CANARIES = 'verify/skills/population-canaries.test.ts';

const timed = (check) => ({ ...check, timed: true });

export default {
  id: 's6-servo-population-train',
  stage: 6,
  title: 'Stage 6: training against a servo population beats uniform ranges',
  state: 'parked',
  parked:
    'Stand on this servo quad passes Arena limp (32, 30 and 31 of 32 on the population median, where quad-servo without servos falls in all but 4, 5 and 6), so it can’t tell population draws from uniform ranges. Forge also varies only kp per robot. Waits for a task a limp robot fails, and per-robot damping, armature, force and delay in Forge.',
  checks: [
    shCheck('forge-train builds', 'cargo', [
      'build',
      '--release',
      '--manifest-path',
      'forge/Cargo.toml',
      '-p',
      'forge-train',
    ]),
    timed(
      vitestCheck(
        'Stand on quad-servo with STS3215 servos, trained with population draws, passes Arena on 8 held-out hidden twins at a rate no worse than Stand trained on uniform ranges',
        'verify/skills/population-stand.test.ts',
      ),
    ),
  ],
  canaries: [
    vitestCanary(
      'a limp quad fails Stand on a hidden twin',
      CANARIES,
      'canary limp: a limp quad passes Arena on a hidden twin',
    ),
  ],
};
