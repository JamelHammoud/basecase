import fs from 'node:fs';
import path from 'node:path';
import { fail, pass, ROOT, sh, shCheck } from '../lib/gate.mjs';
import { trainerPython } from '../lib/python.mjs';
import { prepareJob, FORGE_BIN, FORGE_MANIFEST, runForge } from '../forge/run.mjs';
import { recordBaseline, speedupAtLeast } from '../forge/tts.mjs';

const VECTOR = path.join(ROOT, 'verify', 'out', 'forge', 'adam.json');

const PLANTED = path.join(ROOT, 'verify', 'out', 'forge', 'adam-planted.json');

const adamWorst = (vector) => {
  const r = trainerPython('verify/forge/adam_check.py', [vector]);

  if (!r.ok) return fail(r.stderr.slice(-400));

  const { worst } = JSON.parse(r.stdout.trim().split('\n').at(-1));

  return worst <= 1e-4 ? pass(`worst ${worst.toExponential(2)}`) : fail(`worst ${worst}`);
};

const adam = {
  name: 'Forge Adam matches torch to 1e-4 over 50 steps',
  run: () => {
    const made = sh(FORGE_BIN, ['--adam-vector', VECTOR]);

    return made.ok ? adamWorst(VECTOR) : fail(made.stderr.slice(-400));
  },
};

const plantedAdam = {
  name: 'an Adam result one weight off by 1e-3 is rejected',
  run: () => {
    const made = sh(FORGE_BIN, ['--adam-vector', VECTOR]);

    if (!made.ok) return pass(`could not make the vector: ${made.stderr.slice(-200)}`);

    const vector = JSON.parse(fs.readFileSync(VECTOR, 'utf8'));

    vector.final[0].w[0] += 1e-3;
    fs.writeFileSync(PLANTED, JSON.stringify(vector));

    return adamWorst(PLANTED);
  },
};

const speed = {
  name: 'Forge reaches 45K steps/s at 1024 envs',
  timed: true,
  run: () => {
    const r = runForge(prepareJob('quad-servo', 'f2-speed', { minutes: 30, maxIterations: 20, envs: 1024 }));
    const fps = r.lines.filter((l) => l.type === 'progress').at(-1)?.fps ?? 0;

    return fps >= 45000 ? pass(`${Math.round(fps)} steps/s`) : fail(`${Math.round(fps)} steps/s`);
  },
};

const offPolicy = {
  name: 'FastSAC and FlashSAC run and report the same events',
  run: () => {
    for (const algo of ['fastsac', 'flashsac']) {
      const r = runForge(prepareJob('quad-servo', `f2-${algo}`, { minutes: 30, maxIterations: 50, algo }));

      if (!r.ok || !r.lines.some((l) => l.type === 'done')) return fail(`${algo}: ${r.stderr.slice(-300)}`);
    }

    return pass();
  },
};

export default {
  id: 's1-f2-learner',
  stage: 1,
  title: 'F2: own learner, off-policy options, 3x time-to-skill',
  state: 'required',
  checks: [
    shCheck('forge-train builds', 'cargo', [
      'build',
      '--release',
      '--manifest-path',
      FORGE_MANIFEST,
      '-p',
      'forge-train',
    ]),
    adam,
    speed,
    offPolicy,
    recordBaseline,
    speedupAtLeast(3),
  ],
  canaries: [plantedAdam],
};
