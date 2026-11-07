import fs from 'node:fs';
import path from 'node:path';
import { fail, pass, ROOT, sh, vitestCheck } from '../lib/gate.mjs';
import { jsonLines, trainerPython } from '../lib/python.mjs';

const FIXTURES = path.join(ROOT, 'verify', 'out', 'fixtures');
const BASELINE = path.join(ROOT, 'verify', 'baselines', 'python-phases.json');
const BENCH_ROBOT = 'quad-servo';
const BENCH_ITERATIONS = 20;
const MIN_TIMED_SHARE = 0.85;

function runBench() {
  const dir = path.join(ROOT, 'verify', 'out', 'bench', BENCH_ROBOT);

  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(path.join(FIXTURES, BENCH_ROBOT, 'model.xml'), path.join(dir, 'model.xml'));

  const job = JSON.parse(fs.readFileSync(path.join(FIXTURES, BENCH_ROBOT, 'job.json'), 'utf8'));

  fs.writeFileSync(
    path.join(dir, 'job.json'),
    JSON.stringify({ ...job, minutes: 30, maxIterations: BENCH_ITERATIONS }),
  );

  const r = trainerPython('electron/trainer/train.py', ['--job', dir]);

  return { r, lines: jsonLines(r.stdout) };
}

export function timedShare(progress) {
  const timed = Object.values(progress.phases).reduce((s, v) => s + v, 0);

  return timed / progress.elapsedS;
}

export function phaseProblem(progress, iterations) {
  if (!progress) return 'The trainer reported no progress';

  if (progress.iteration !== iterations) return `Ran ${progress.iteration} iterations, wanted ${iterations}`;

  const missing = Object.entries(progress.phases).filter(([, v]) => v <= 0);

  if (missing.length) return `No time recorded for ${missing.map(([k]) => k).join(', ')}`;

  const share = timedShare(progress);

  return share < MIN_TIMED_SHARE ? `Timers cover only ${(share * 100).toFixed(0)}% of training time` : null;
}

const phaseTimers = {
  name: 'train.py reports measured phase timers for a real run',
  run: () => {
    const { r, lines } = runBench();

    if (!r.ok) return fail(r.stderr.split('\n').slice(-6).join('\n'));

    const progress = lines.filter((l) => l.type === 'progress').at(-1);
    const problem = phaseProblem(progress, BENCH_ITERATIONS);

    if (problem) return fail(problem);

    fs.writeFileSync(
      BASELINE,
      `${JSON.stringify(
        {
          robot: BENCH_ROBOT,
          envs: 64,
          iterations: progress.iteration,
          steps: progress.steps,
          seconds: progress.elapsedS,
          stepsPerSecond: progress.fps,
          phases: progress.phases,
        },
        null,
        2,
      )}\n`,
    );

    return pass(`${Math.round(progress.fps)} steps/s`, { fps: progress.fps, phases: progress.phases });
  },
};

const reference = {
  name: 'C MuJoCo reference computed for every fixture',
  run: () => {
    const r = trainerPython('verify/parity/reference.py', [FIXTURES, '500']);

    return r.ok ? pass() : fail(r.stderr.split('\n').slice(-6).join('\n'));
  },
};

export default {
  id: 's0-foundation',
  stage: 0,
  title: 'Sim fixes, fixtures, WASM parity and measured trainer phases',
  state: 'required',
  checks: [
    vitestCheck('fixture robots classify and emit', 'verify/fixtures.test.ts'),
    reference,
    vitestCheck('WASM matches C MuJoCo on every fixture', 'verify/parity/parity.test.ts'),
    {
      name: 'sim regression tests pass',
      run: () => {
        const r = sh('npx', ['vitest', 'run', 'src/sim', 'verify/lib']);

        return r.ok ? pass() : fail(r.stdout.split('\n').slice(-15).join('\n'));
      },
    },
    phaseTimers,
  ],
  canaries: [
    {
      name: 'a run with no timed physics is rejected',
      run: () => {
        const p = phaseProblem(
          {
            iteration: BENCH_ITERATIONS,
            elapsedS: 10,
            phases: { physics: 0, observe: 1, reward: 1, inference: 1, gradient: 7 },
          },
          BENCH_ITERATIONS,
        );

        return p ? fail(p) : pass();
      },
    },
    {
      name: 'timers covering too little of the run are rejected',
      run: () => {
        const p = phaseProblem(
          {
            iteration: BENCH_ITERATIONS,
            elapsedS: 100,
            phases: { physics: 5, observe: 1, reward: 1, inference: 1, gradient: 7 },
          },
          BENCH_ITERATIONS,
        );

        return p ? fail(p) : pass();
      },
    },
  ],
};
