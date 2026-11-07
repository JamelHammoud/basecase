import fs from 'node:fs';
import path from 'node:path';
import { ROOT, sh, fail, pass, vitestCheck } from '../lib/gate.mjs';
import { trainerPython } from '../lib/python.mjs';

export const FUZZ = path.join(ROOT, 'verify', 'out', 'fuzz');
export const SIM_BIN = path.join(ROOT, 'forge', 'target', 'release', 'forge-sim');

export const TOLERANCE = {
  l0: 5e-5,
  l1: 1e-3,
  l3Qpos: 1e-3,
  l3Qvel: 2e-2,
};

export const emitFuzz = vitestCheck('200 fuzzed robots emitted', 'verify/forge/fuzz.test.ts');

export const fuzzReference = {
  name: 'C MuJoCo computes the reference for every fuzzed robot',
  run: () => {
    const r = trainerPython('verify/parity/reference.py', [FUZZ, '60']);

    return r.ok ? pass() : fail(r.stderr.slice(-600));
  },
};

function relative(a, b, floor = 1e-4) {
  let worst = 0;

  if (a.length !== b.length) return Infinity;

  for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i] - b[i]) / Math.max(Math.abs(b[i]), floor));

  return worst;
}

export function parityErrors(ours, ref) {
  const fields = ['xpos', 'cinert', 'qfrc_bias'];
  const l0 = Math.max(...fields.map((f) => relative(ours.single[f], ref.single[f])));
  const l1 = relative(ours.single.qacc, ref.single.qacc, 1e-1);
  const contacts = Math.abs(ours.single.ncon - ref.single.ncon);
  let l3Qpos = 0;
  let l3Qvel = 0;

  ref.rollout.forEach((frame, i) => {
    l3Qpos = Math.max(l3Qpos, relative(ours.rollout[i]?.qpos ?? [], frame.qpos, 1));
    l3Qvel = Math.max(l3Qvel, relative(ours.rollout[i]?.qvel ?? [], frame.qvel, 1e-1));
  });

  return { l0, l1, contacts, l3Qpos, l3Qvel };
}

export function parityProblem(e) {
  if (e.contacts) return `Active contact count differs by ${e.contacts}`;

  if (e.l0 > TOLERANCE.l0) return `L0 kernel error ${e.l0.toExponential(2)}`;

  if (e.l1 > TOLERANCE.l1) return `L1 acceleration error ${e.l1.toExponential(2)}`;

  if (e.l3Qpos > TOLERANCE.l3Qpos) return `L3 qpos error ${e.l3Qpos.toExponential(2)}`;

  return e.l3Qvel > TOLERANCE.l3Qvel ? `L3 qvel error ${e.l3Qvel.toExponential(2)}` : null;
}

export function parityAcrossFuzz(backend) {
  return {
    name: `${backend} engine matches C MuJoCo on every fuzzed robot, L0 to L3`,
    run: () => {
      const robots = fs.readdirSync(FUZZ);
      const problems = [];
      const worst = { l0: 0, l1: 0, l3Qpos: 0, l3Qvel: 0 };

      for (const name of robots) {
        const dir = path.join(FUZZ, name);
        const r = sh(SIM_BIN, ['--xml', path.join(dir, 'model.xml'), '--steps', '60', '--backend', backend]);

        if (!r.ok) {
          problems.push(`${name}: ${r.stderr.slice(-200)}`);

          continue;
        }

        const ref = JSON.parse(fs.readFileSync(path.join(dir, 'reference.json'), 'utf8'));
        const e = parityErrors(JSON.parse(r.stdout), ref);
        const problem = parityProblem(e);

        for (const k of Object.keys(worst)) worst[k] = Math.max(worst[k], e[k]);

        if (problem) problems.push(`${name}: ${problem}`);
      }

      return problems.length
        ? fail(`${problems.length} of ${robots.length}: ${problems.slice(0, 5).join('; ')}`, worst)
        : pass(`worst ${JSON.stringify(worst)}`, worst);
    },
  };
}

export function batchIdentity(backend) {
  return {
    name: `${backend} batch step equals single step, bit for bit`,
    run: () => {
      const r = sh(SIM_BIN, [
        '--batch-identity',
        '--xml',
        path.join(ROOT, 'verify/out/fixtures/quad-servo/model.xml'),
        '--backend',
        backend,
      ]);

      return r.ok && JSON.parse(r.stdout).identical === true
        ? pass()
        : fail(r.stdout.slice(-300) + r.stderr.slice(-300));
    },
  };
}

export function substepsAtLeast(backend, minimum, options = {}) {
  const { envs = 4096, seconds = 60 } = options;

  return {
    name: `${backend} sustains ${minimum / 1000}K substeps/s for ${seconds} s at ${envs} envs`,
    timed: true,
    run: () => {
      const r = sh(SIM_BIN, [
        '--bench',
        '--xml',
        path.join(ROOT, 'verify/out/fixtures/quad-servo/model.xml'),
        '--backend',
        backend,
        '--envs',
        String(envs),
        '--seconds',
        String(seconds),
      ]);

      if (!r.ok) return fail(r.stderr.slice(-400));

      const { substepsPerS, sustainedMin } = JSON.parse(r.stdout);

      return sustainedMin >= minimum
        ? pass(`${Math.round(sustainedMin)} sustained`, { substepsPerS, sustainedMin })
        : fail(`${Math.round(sustainedMin)} sustained`, { substepsPerS, sustainedMin });
    },
  };
}

export const planted = {
  name: 'a planted acceleration error is caught',
  run: () => {
    const ref = {
      single: { xpos: [1], cinert: [1], qfrc_bias: [1], qacc: [1], ncon: 0 },
      rollout: [],
    };
    const p = parityProblem(parityErrors({ ...ref, single: { ...ref.single, qacc: [1.5] } }, ref));

    return p ? fail(p) : pass();
  },
};

export const plantedRollout = {
  name: 'a planted rollout drift is caught',
  run: () => {
    const single = { xpos: [1], cinert: [1], qfrc_bias: [1], qacc: [1], ncon: 0 };
    const ref = { single, rollout: [{ qpos: [1], qvel: [0] }] };
    const p = parityProblem(parityErrors({ single, rollout: [{ qpos: [1.1], qvel: [0] }] }, ref));

    return p ? fail(p) : pass();
  },
};
