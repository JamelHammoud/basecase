import { vitestCanary } from '../lib/canary.mjs';
import { shCheck, vitestCheck } from '../lib/gate.mjs';

const CANARIES = 'verify/cases/canaryPlay.test.ts';
const timed = (check) => ({ ...check, timed: true });

export default {
  id: 's2-cases-play',
  stage: 2,
  title: 'Stage 2: one Case on different arms, every Case solvable, drive by class, gallery at real time',
  state: 'required',
  checks: [
    vitestCheck(
      'one Case file, written once, runs on arm-3dof, arm-6dof and a gate-only arm: limp fails, reference passes',
      'verify/cases/portable.test.ts',
    ),
    vitestCheck(
      'every example, New Case goal and world, and gallery Case: limp margin negative, reference margin positive',
      'verify/cases/margins.test.ts',
    ),
    vitestCheck(
      'e2e drive: an arm moves its hand both ways, a rover goes and stops, a hexapod walks, focus loss stops',
      'verify/cases/drivePlay.test.ts',
    ),
    shCheck('the production web bundle builds', 'npx', [
      'vite',
      'build',
      '--mode',
      'web',
      '--outDir',
      'verify/out/gallery-web',
      '--emptyOutDir',
    ]),
    timed(
      vitestCheck(
        'every gallery link loads from the web build and drives at 0.95x to 1.05x real time, headless',
        'verify/cases/galleryRealtime.test.ts',
      ),
    ),
    shCheck('Types hold', 'npx', ['tsc', '-b']),
  ],
  canaries: [
    vitestCanary(
      'a limp run that is really the reference is caught',
      CANARIES,
      'canary limp: a runner whose limp is really the reference passes the margin check',
    ),
    vitestCanary(
      'an arm drive that never moves is caught',
      CANARIES,
      'canary frozen arm: an arm drive that never moves the hand passes',
    ),
    vitestCanary(
      'a rover that runs on after release is caught',
      CANARIES,
      'canary runaway rover: a rover that keeps going after release passes',
    ),
    vitestCanary(
      'a gallery at half speed is caught',
      CANARIES,
      'canary slow gallery: a gallery at half real time passes',
    ),
    vitestCanary(
      'a gallery at double speed is caught',
      CANARIES,
      'canary fast gallery: a gallery at double real time passes',
    ),
  ],
};
