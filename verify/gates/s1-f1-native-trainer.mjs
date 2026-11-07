import path from 'node:path';
import { fail, pass, ROOT, sh, shCheck, vitestCheck } from '../lib/gate.mjs';
import { trainerPython } from '../lib/python.mjs';
import { eventProblems, F1_MIN_FPS, sampleRatioProblem } from '../forge/check.mjs';
import { FORGE_MANIFEST, prepareJob, runForge, runPython, stepsToGate } from '../forge/run.mjs';

const SEEDS = 10;
const TTS_ROBOT = 'quad-servo';
const TTS_OVER = { task: 'stand', command: [0, 0, 0], minutes: 20, gateEvery: 50, evalSeeds: 32 };

const speedRun = {
  name: 'Forge trains a real robot at 40K steps/s with the same events as train.py',
  run: () => {
    const dir = prepareJob('quad-servo', 'f1-speed', { minutes: 30, maxIterations: 60 });
    const r = runForge(dir);

    if (!r.ok) return fail(r.stderr.slice(-800));

    const problems = eventProblems(r.lines);

    if (problems.length) return fail(problems.join('; '));

    const fps = r.lines.filter((l) => l.type === 'progress').at(-1).fps;

    return fps >= F1_MIN_FPS
      ? pass(`${Math.round(fps)} steps/s`, { fps })
      : fail(`${Math.round(fps)} steps/s`, { fps });
  },
};

const onnxExport = {
  name: 'Forge exports a valid ONNX policy that matches its own actions',
  run: () => {
    const r = trainerPython('verify/forge/onnx_check.py', [path.join(ROOT, 'verify/out/forge/f1-speed')]);

    if (!r.ok) return fail(r.stderr.slice(-800));

    const { worst } = JSON.parse(r.stdout.trim().split('\n').at(-1));

    return worst < 1e-3 ? pass(`worst ${worst.toExponential(2)}`) : fail(`worst ${worst}`);
  },
};

const samples = {
  name: 'Forge reaches the stand skill within 20% of the samples train.py needs, over 10 seeds',
  run: () => {
    const python = [];
    const forge = [];

    for (let seed = 0; seed < SEEDS; seed++) {
      python.push(stepsToGate(runPython(prepareJob(TTS_ROBOT, `tts-py-${seed}`, { ...TTS_OVER, seed })).lines));
      forge.push(stepsToGate(runForge(prepareJob(TTS_ROBOT, `tts-forge-${seed}`, { ...TTS_OVER, seed })).lines));
    }

    if (python.every((s) => s === null)) return fail('Python never reached the skill, so there is nothing to compare');

    const problem = sampleRatioProblem(forge, python);

    return problem ? fail(problem, { python, forge }) : pass('', { python, forge });
  },
};

export default {
  id: 's1-f1-native-trainer',
  stage: 1,
  title: 'F1: native PPO on C MuJoCo with no Python',
  state: 'required',
  checks: [
    shCheck('cargo test passes', 'cargo', ['test', '--release', '--manifest-path', FORGE_MANIFEST]),
    shCheck('forge-train builds', 'cargo', [
      'build',
      '--release',
      '--manifest-path',
      FORGE_MANIFEST,
      '-p',
      'forge-train',
    ]),
    {
      name: 'forge-train links no Python',
      run: () => {
        const r = sh('cargo', ['tree', '--manifest-path', FORGE_MANIFEST, '-p', 'forge-train']);

        return r.ok && !/pyo3|numpy|torch/i.test(r.stdout) ? pass() : fail('Python-side crate in the tree');
      },
    },
    speedRun,
    onnxExport,
    vitestCheck('A Forge policy runs in the app with matching actions', 'verify/forge/policy.test.ts'),
    samples,
  ],
  canaries: [
    {
      name: 'events missing a field are rejected',
      run: () => {
        const p = eventProblems([
          { type: 'progress', iteration: 1 },
          { type: 'done', steps: 1, eval: {} },
        ]);

        return p.length ? fail(p[0]) : pass();
      },
    },
    {
      name: 'needing too many samples is rejected',
      run: () => {
        const p = sampleRatioProblem([200, 200, 200], [100, 100, 100]);

        return p ? fail(p) : pass();
      },
    },
  ],
};
