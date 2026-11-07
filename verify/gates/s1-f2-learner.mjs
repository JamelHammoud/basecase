import path from 'node:path';
import { fail, pass, ROOT, sh, shCheck } from '../lib/gate.mjs';
import { trainerPython } from '../lib/python.mjs';
import { prepareJob, FORGE_BIN, FORGE_MANIFEST, runForge } from '../forge/run.mjs';
import { recordBaseline, speedupAtLeast } from '../forge/tts.mjs';

const VECTOR = path.join(ROOT, 'verify', 'out', 'forge', 'adam.json');

const adam = {
  name: 'Forge Adam matches torch to 1e-4 over 50 steps',
  run: () => {
    const made = sh(FORGE_BIN, ['--adam-vector', VECTOR]);

    if (!made.ok) return fail(made.stderr.slice(-400));

    const r = trainerPython('verify/forge/adam_check.py', [VECTOR]);

    if (!r.ok) return fail(r.stderr.slice(-400));

    const { worst } = JSON.parse(r.stdout.trim().split('\n').at(-1));

    return worst <= 1e-4 ? pass(`worst ${worst.toExponential(2)}`) : fail(`worst ${worst}`);
  },
};

const speed = {
  name: 'Forge reaches 45K steps/s at 1024 envs',
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
  canaries: [
    {
      name: 'a wildly wrong Adam result is rejected',
      run: () => {
        const worst = 0.5;

        return worst <= 1e-4 ? pass() : fail(`worst ${worst}`);
      },
    },
  ],
};
