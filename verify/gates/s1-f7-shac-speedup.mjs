import { shCheck } from '../lib/gate.mjs';
import { FORGE_MANIFEST } from '../forge/run.mjs';
import { speedupAtLeast } from '../forge/tts.mjs';

export default {
  id: 's1-f7-shac-speedup',
  stage: 1,
  title: 'F7: first-order (SHAC) training reaches the walk skill at least 15x faster than the Python baseline',
  state: 'parked',
  parked:
    'SHAC learns to stand but finds no gait through stiff contacts on any fixture robot (0.013x quad-servo, 0.096x hexapod, 0.005x biped-servo at the 60-minute budget), and at about 1 s per iteration with walk checks every 50 iterations its ceiling is about 1x. PPO stays the default; SHAC is opt-in (algo: "shac"). The bar stays 15x until a maintainer changes it.',
  checks: [speedupAtLeast(15, { backend: 'metal', algo: 'shac' })],
  canaries: [
    shCheck('a policy trained on planted bad physics fails replay', 'cargo', [
      'test',
      '--release',
      '--manifest-path',
      FORGE_MANIFEST,
      '-p',
      'forge-train',
      'canary_bad_physics_replay_fails',
    ]),
  ],
};
