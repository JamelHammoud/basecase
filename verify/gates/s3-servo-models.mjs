import fs from 'node:fs';
import path from 'node:path';
import { fail, pass, ROOT, sh, shCheck, vitestCheck } from '../lib/gate.mjs';
import { trainerPython } from '../lib/python.mjs';

const PLANT_SRC = 'hw/crates/plant-bam/src';
const PLANT_COMMIT = '395bba2';
const REFERENCE = path.join(ROOT, 'verify', 'servo', 'bam-reference', 'Cargo.toml');
const REFERENCE_BUILD = path.join(ROOT, 'verify', 'out', 'servo', 'bam-reference-build');
const OUT = path.join(ROOT, 'verify', 'out', 'servo');
const BAM_JSON = path.join(OUT, 'bam.json');
const VITEST = ['vitest', 'run', '--config', 'verify/vitest.config.ts'];

const tail = (text, lines = 12) => text.trim().split('\n').slice(-lines).join('\n');

const plantUnchanged = {
  name: `plant-bam source is byte-identical to ${PLANT_COMMIT}`,
  run: () => {
    const diff = sh('git', ['diff', '--quiet', PLANT_COMMIT, '--', PLANT_SRC]);
    const untracked = sh('git', ['status', '--porcelain', '--', PLANT_SRC]);

    if (!diff.ok) return fail(`${PLANT_SRC} differs from ${PLANT_COMMIT}`);

    return untracked.stdout.trim() ? fail(`Uncommitted files in ${PLANT_SRC}`) : pass();
  },
};

const bamReference = {
  name: 'BAM reference trajectories from plant-bam (STS3215 7.4 V, XL330 5 V)',
  run: () => {
    const r = sh('cargo', [
      'run',
      '--quiet',
      '--release',
      '--manifest-path',
      REFERENCE,
      '--target-dir',
      REFERENCE_BUILD,
    ]);

    if (!r.ok) return fail(tail(r.stderr));

    const runs = JSON.parse(r.stdout).runs ?? [];

    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(BAM_JSON, r.stdout);

    return runs.length === 32 ? pass(`${runs.length} runs`) : fail(`Expected 32 runs, got ${runs.length}`);
  },
};

const scoreSummary = () => {
  const file = path.join(OUT, 'scores.json');

  if (!fs.existsSync(file)) return {};

  const scores = JSON.parse(fs.readFileSync(file, 'utf8'));

  return Object.fromEntries(scores.map((s) => [s.run, { sim: s.sim, teleport: s.teleport, fopd: s.fopd }]));
};

const againstBam = {
  name: 'sim RMS <= 0.5 x teleport and <= fitted FOPD against BAM, per servo, load and profile',
  run: () => {
    const r = sh('npx', [...VITEST, 'verify/servo/servo.test.ts']);

    return r.ok ? pass('', scoreSummary()) : fail(tail(`${r.stderr}\n${r.stdout}`, 20), scoreSummary());
  },
};

const servoReference = {
  name: 'C MuJoCo reference computed for every servo-driven fixture',
  run: () => {
    const r = trainerPython('verify/parity/reference.py', [path.join(OUT, 'fixtures'), '500']);

    return r.ok ? pass() : fail(tail(r.stderr, 6));
  },
};

const fixtureReference = {
  name: 'C MuJoCo reference computed for every fixture (s0-foundation)',
  run: () => {
    const r = trainerPython('verify/parity/reference.py', [path.join(ROOT, 'verify', 'out', 'fixtures'), '500']);

    return r.ok ? pass() : fail(tail(r.stderr, 6));
  },
};

const withCanary = (canary, files, extra = []) =>
  sh('npx', [...VITEST, ...files, ...extra], { env: { ...process.env, SERVO_CANARY: canary } });

const BAR_MISSED = /expected [\d.e-]+ to be less than/;

export const canaryVerdict = (r) => {
  if (r.ok) return pass();

  const output = `${r.stdout}\n${r.stderr}`;

  return BAR_MISSED.test(output) ? fail(tail(r.stdout, 6)) : pass(`Failed for another reason: ${tail(output, 4)}`);
};

const canaryRun = (canary, files, extra) => () => canaryVerdict(withCanary(canary, files, extra));

export default {
  id: 's3-servo-models',
  stage: 3,
  title: 'Catalog servos carry BAM fits; the sim tracks BAM and a reset never kicks',
  state: 'required',
  checks: [
    plantUnchanged,
    bamReference,
    againstBam,
    vitestCheck(
      'no kick at reset on any fixture robot (under 5% of force range for 50 ms)',
      'verify/servo/kick.test.ts',
    ),
    servoReference,
    vitestCheck('WASM matches C MuJoCo with servo delays and fitted dynamics', 'verify/servo/parity.test.ts'),
    vitestCheck('old policies read as stale in isStalePolicy and the agent tools', 'verify/servo/stale.test.ts'),
    vitestCheck('fixture robots classify and emit (s0-foundation)', 'verify/fixtures.test.ts'),
    fixtureReference,
    vitestCheck('WASM matches C MuJoCo on every fixture (s0-foundation)', 'verify/parity/parity.test.ts'),
    shCheck('sim regression tests pass', 'npx', ['vitest', 'run', 'src/sim', 'src/data', 'src/agent']),
  ],
  canaries: [
    {
      name: 'kp x55 (the Menagerie SO-101 error) fails the BAM bar',
      run: canaryRun('kp55', ['verify/servo/servo.test.ts']),
    },
    {
      name: 'removing the servo delay fails the BAM bar on the chirp',
      run: canaryRun('no-delay', ['verify/servo/servo.test.ts'], ['-t', 'chirp']),
    },
    {
      name: 'an unprimed delay history kicks a robot at reset',
      run: canaryRun('no-prime', ['verify/servo/kick.test.ts']),
    },
  ],
};
