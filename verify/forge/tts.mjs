import fs from 'node:fs';
import path from 'node:path';
import { fail, pass, ROOT } from '../lib/gate.mjs';
import { median } from './check.mjs';
import { gpuProblems, prepareJob, replayInC, runForge, runPython } from './run.mjs';

export const TTS_ROBOTS = ['quad-servo', 'hexapod', 'biped-servo'];
export const BASELINE_FILE = path.join(ROOT, 'verify', 'baselines', 'time-to-skill.json');

const RUNS = 5;
const BUDGET_MINUTES = 60;
const BUDGET_S = BUDGET_MINUTES * 60;
const OVER = {
  task: 'walk',
  command: [0.25, 0, 0],
  minutes: BUDGET_MINUTES,
  gateEvery: 50,
  evalSeeds: 32,
  gateSpeed: 0.2,
};

const gateSeconds = (lines) => {
  const hit = lines.filter((l) => l.type === 'gate').find((l) => l.passed >= Math.ceil(0.9 * l.seeds));

  if (!hit) return null;

  return lines.filter((l) => l.type === 'progress').find((l) => l.steps >= hit.steps)?.elapsedS ?? null;
};

function measurePython(robot) {
  const seconds = [];

  for (let seed = 0; seed < RUNS; seed++) {
    const r = runPython(prepareJob(robot, `tts-base-${robot}-${seed}`, { ...OVER, seed }));

    seconds.push(gateSeconds(r.lines) ?? BUDGET_S);
  }

  return median(seconds);
}

function forgeRun(robot, seed, { extraJob, requireGpu }) {
  const dir = prepareJob(robot, `tts-forge-${robot}-${seed}`, { ...OVER, seed, ...extraJob });
  const r = runForge(dir);
  const gpu = requireGpu ? gpuProblems(r.lines) : [];

  if (gpu.length) return { seconds: BUDGET_S, problem: `${robot} seed ${seed} ${gpu[0]}` };

  if (!r.ok) return { seconds: BUDGET_S, problem: `${robot} seed ${seed}: the trainer exited with ${r.status}` };

  const replay = replayInC(dir);

  return replay.reached
    ? { seconds: r.seconds, problem: null }
    : { seconds: Math.max(r.seconds, BUDGET_S), problem: null, missed: `${robot} seed ${seed}: ${replay.why}` };
}

function measureForge(robot, options) {
  const runs = Array.from({ length: RUNS }, (_, seed) => forgeRun(robot, seed, options));

  return {
    seconds: median(runs.map((r) => r.seconds)),
    problems: runs.flatMap((r) => (r.problem ? [r.problem] : [])),
    missed: runs.flatMap((r) => (r.missed ? [r.missed] : [])),
  };
}

export const recordBaseline = {
  name: 'Python time-to-skill baseline recorded for three robots',
  timed: true,
  run: () => {
    if (fs.existsSync(BASELINE_FILE)) {
      const kept = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')).seconds;

      return pass(`kept the committed baseline ${JSON.stringify(kept)}`, kept);
    }

    const results = Object.fromEntries(TTS_ROBOTS.map((r) => [r, measurePython(r)]));

    fs.writeFileSync(BASELINE_FILE, `${JSON.stringify({ budgetS: BUDGET_S, seconds: results }, null, 2)}\n`);

    return pass(JSON.stringify(results), results);
  },
};

export function speedupProblems(ratios, factor) {
  return Object.entries(ratios).flatMap(([robot, ratio]) =>
    Number.isFinite(ratio) && ratio >= factor ? [] : [`${robot} ${ratio.toFixed(2)}x`],
  );
}

export function speedupAtLeast(factor, extraJob = {}, { requireGpu = false } = {}) {
  return {
    name: `Forge reaches the walk skill at least ${factor}x faster than the Python baseline on every robot, by wall clock, replayed in C MuJoCo${requireGpu ? ', on the GPU loop' : ''}`,
    timed: true,
    run: () => {
      if (!fs.existsSync(BASELINE_FILE)) return fail('No baseline recorded');

      const { seconds } = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
      const measured = Object.fromEntries(
        TTS_ROBOTS.map((robot) => [robot, measureForge(robot, { extraJob, requireGpu })]),
      );
      const ratios = Object.fromEntries(TTS_ROBOTS.map((robot) => [robot, seconds[robot] / measured[robot].seconds]));
      const forgeSeconds = Object.fromEntries(TTS_ROBOTS.map((robot) => [robot, measured[robot].seconds]));
      const problems = [
        ...TTS_ROBOTS.flatMap((robot) => measured[robot].problems),
        ...speedupProblems(ratios, factor).map((p) => `below ${factor}x: ${p}`),
      ];
      const missed = TTS_ROBOTS.flatMap((robot) => measured[robot].missed);
      const summary = TTS_ROBOTS.map((robot) => `${robot} ${ratios[robot].toFixed(2)}x`).join(', ');
      const metrics = { ratios, forgeSeconds, missed };

      return problems.length ? fail(`${summary}; ${problems.join('; ')}`, metrics) : pass(summary, metrics);
    },
  };
}
