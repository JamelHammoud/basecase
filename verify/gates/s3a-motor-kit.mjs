import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { vitestCanary } from '../lib/canary.mjs';
import { fail, pass, ROOT, shCheck, vitestCheck } from '../lib/gate.mjs';

const FROZEN = {
  'src/skills/arena.ts': 'cbd62d7f1c82009e35704b7371c08f2ea0ba77f4602c2e4d823c9f55066483d4',
  'src/skills/arenaWorld.ts': '4d927e150e787c50026fa9b4ec7af88197fd4df1c99187b5a917ad32d8a6ef89',
  'src/skills/arenaStats.ts': '483b8139b520fcb4aa1839f397739f746190a7f0bb910f46b7bcb5fd4a7f9aff',
  'src/skills/arenaSignals.ts': '4c8e0213acef95405bd4f20a807bd5e9f763441cf4e819a2ee2b7c83f5c28107',
  'src/skills/contract.ts': '59ddcee9ca74df14a0669d8570f0a97a41070ecaf4bb7e26a9090f4c6392b871',
};

const digest = (file) =>
  createHash('sha256')
    .update(fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n'))
    .digest('hex');

const frozenJudges = {
  name: 'Arena and the contract wrapper are the ones this gate was written against',
  run: () => {
    const moved = Object.entries(FROZEN)
      .filter(([file, hash]) => !fs.existsSync(path.join(ROOT, file)) || digest(file) !== hash)
      .map(([file]) => file);

    return moved.length ? fail(`Changed without a maintainer: ${moved.join(', ')}`) : pass();
  },
};

const timed = (check) => ({ ...check, timed: true });

const CANARIES = 'verify/skills/canaries.test.ts';
const JUDGE_CANARIES = 'verify/skills/canary-judge.test.ts';

export default {
  id: 's3a-motor-kit',
  stage: 3,
  title: 'Stage 3a: Motor Kit, biped steering and the solver race',
  state: 'required',
  checks: [
    frozenJudges,
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
        'Motor Kit: quad-servo learns Stand, Velocity tracking, Get-up and Settle through Forge; each passes Arena; the weak quad is refused',
        'verify/skills/kit-quad.test.ts',
      ),
    ),
    timed(
      vitestCheck(
        'Motor Kit: hexapod learns Stand and Velocity tracking through Forge; each passes Arena',
        'verify/skills/kit-hexapod.test.ts',
      ),
    ),
    timed(
      vitestCheck(
        'Motor Kit: biped-servo learns Stand and Velocity tracking through Forge; each passes Arena',
        'verify/skills/kit-biped.test.ts',
      ),
    ),
    vitestCheck(
      'Train here, judge there: every Kit policy acts as Forge wrote it and passes a clean WASM replay',
      'verify/skills/replay.test.ts',
    ),
    vitestCheck(
      'Biped drive: forward, left and right on its Kit skill, with travel, heading of the commanded sign and no fall',
      'verify/skills/steering.test.ts',
    ),
    timed(
      vitestCheck(
        'Solver race: three tasks pass Arena, record method and cost, and the router is within 2× of the cheapest',
        'verify/skills/race.test.ts',
      ),
    ),
    vitestCheck(
      'Freshness: a mass edit reruns Arena, a topology edit needs training, a colour edit stays fresh',
      'verify/skills/freshness.test.ts',
    ),
    vitestCheck(
      'Kit retraining debounces, latest design wins, and waits behind user training',
      'verify/skills/schedule.test.ts',
    ),
    vitestCheck('Cases judge with the one Rust contract, not a TypeScript copy', 'verify/skills/cases.test.ts'),
    shCheck('Skills, Cases and sim unit tests pass', 'npx', ['vitest', 'run', 'src/skills', 'src/cases', 'src/sim']),
    shCheck('Types hold', 'npx', ['tsc', '-b']),
  ],
  canaries: [
    vitestCanary('a limp quad fails Stand', JUDGE_CANARIES, 'canary limp: a limp quad passes Stand'),
    vitestCanary(
      'a zero policy fails Velocity tracking',
      JUDGE_CANARIES,
      'canary zero: a zero policy passes Velocity tracking',
    ),
    vitestCanary(
      'a reward-hacked candidate is rejected by the race',
      CANARIES,
      'canary hacked: a reward-hacked candidate wins the race',
    ),
    vitestCanary('must-fail-weak-quad is refused', CANARIES, 'canary weak: must-fail-weak-quad gets a Stand skill'),
    vitestCanary(
      'a skill moved to another fixture needs training',
      CANARIES,
      'canary transfer: a quad-servo Stand skill is fresh on the hexapod',
    ),
    vitestCanary(
      'a biped that only walks straight fails steering',
      CANARIES,
      'canary straight: a biped that only walks straight passes steering',
    ),
  ],
};
