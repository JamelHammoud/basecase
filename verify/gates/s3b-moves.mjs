import { vitestCanary } from '../lib/canary.mjs';
import { shCheck, vitestCheck } from '../lib/gate.mjs';

const timed = (check) => ({ ...check, timed: true });

const CANARIES = 'verify/skills/moves-canary.test.ts';

export default {
  id: 's3b-moves',
  stage: 3,
  title: 'Stage 3b: Pose-tab animations as trained moves',
  state: 'required',
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
        'Moves: every legged case trains through Forge and passes a fresh Arena; the squat beats playback; the arm plays without training',
        'verify/skills/moves.test.ts',
      ),
    ),
    shCheck('Move cases: valid, routed, standing still fails, one-shots hold their last key', 'npx', [
      'vitest',
      'run',
      '--config',
      'vitest.config.ts',
      'src/skills/moveCases.test.ts',
    ]),
    shCheck('Types hold', 'npx', ['tsc', '-b']),
  ],
  canaries: [
    vitestCanary('a zero policy fails every move', CANARIES, 'canary zero: a zero policy passes a move contract'),
  ],
};
