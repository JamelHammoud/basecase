import { vitestCanary } from '../lib/canary.mjs';
import { shCheck, vitestCheck } from '../lib/gate.mjs';
import { isolationCheck } from '../lib/isolation.mjs';

const PLAY = 'verify/cases/canaryPlay.test.ts';
const DRIVE = 'verify/cases/canaryDrive.test.ts';
const GALLERY = 'verify/cases/canaryGallery.test.ts';
const timed = (check) => ({ ...check, timed: true });

export default {
  id: 's2-cases-play',
  stage: 2,
  title: 'Stage 2: one Case on different arms, every Case solvable, drive by class, gallery at real time',
  state: 'required',
  checks: [
    isolationCheck,
    vitestCheck(
      'one Case file, written once, runs on arm-3dof, arm-6dof and a gate-only arm drawn fresh each run: limp fails, reference passes',
      'verify/cases/portable.test.ts',
    ),
    vitestCheck(
      'every example, New Case goal and world, and gallery Case, none dropped and at least the pinned counts: limp margin negative, reference margin positive',
      'verify/cases/margins.test.ts',
    ),
    vitestCheck(
      'e2e drive: the rendered arm hand moves both ways and matches the reported one, a rover goes and stops, a hexapod walks, focus loss stops',
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
        'every gallery link loads from the web build, drives at 0.95x to 1.05x real time and moves while W is held, headless',
        'verify/cases/galleryRealtime.test.ts',
      ),
    ),
    shCheck('Types hold', 'npx', ['tsc', '-b']),
  ],
  canaries: [
    vitestCanary(
      'a limp run that is really the reference is caught',
      PLAY,
      'canary limp: a runner whose limp is really the reference passes the margin check',
    ),
    vitestCanary(
      'an arm drive that never reaches the sim is caught',
      DRIVE,
      'canary frozen arm: an arm drive whose W and S never reach the sim passes',
    ),
    vitestCanary(
      'a reported hand that moves while the rendered arm stays put is caught',
      DRIVE,
      'canary lying hand: a reported hand that moves while the rendered arm stays put passes',
    ),
    vitestCanary(
      'a rover that runs on after release is caught',
      DRIVE,
      'canary runaway rover: a rover whose release never reaches the sim passes',
    ),
    vitestCanary(
      'a gallery at half speed is caught',
      GALLERY,
      'canary slow gallery: a gallery whose sim runs at half speed passes',
    ),
    vitestCanary(
      'a gallery at double speed is caught',
      GALLERY,
      'canary fast gallery: a gallery whose sim runs at double speed passes',
    ),
    vitestCanary(
      'a gallery that keeps time but never moves is caught',
      GALLERY,
      'canary still gallery: a gallery whose W never reaches the sim passes',
    ),
  ],
};
