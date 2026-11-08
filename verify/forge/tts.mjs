import fs from 'node:fs';
import path from 'node:path';
import { fail, pass, ROOT } from '../lib/gate.mjs';
import { median } from './check.mjs';
import { prepareJob, runForge, runPython } from './run.mjs';

export const TTS_ROBOTS = ['quad-servo', 'hexapod', 'biped-servo'];
export const BASELINE_FILE = path.join(ROOT, 'verify', 'baselines', 'time-to-skill.json');

const RUNS = 5;
const BUDGET_MINUTES = 60;
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

function measure(trainer, robot, name) {
  const seconds = [];

  for (let seed = 0; seed < RUNS; seed++) {
    const dir = prepareJob(robot, `${name}-${robot}-${seed}`, { ...OVER, seed });
    const r = trainer(dir);

    seconds.push(gateSeconds(r.lines) ?? BUDGET_MINUTES * 60);
  }

  return median(seconds);
}

export const recordBaseline = {
  name: 'Python time-to-skill baseline recorded for three robots',
  timed: true,
  run: () => {
    if (fs.existsSync(BASELINE_FILE)) {
      const kept = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')).seconds;

      return pass(`kept the committed baseline ${JSON.stringify(kept)}`, kept);
    }

    const results = Object.fromEntries(TTS_ROBOTS.map((r) => [r, measure(runPython, r, 'tts-base')]));

    fs.writeFileSync(BASELINE_FILE, `${JSON.stringify({ budgetS: BUDGET_MINUTES * 60, seconds: results }, null, 2)}\n`);

    return pass(JSON.stringify(results), results);
  },
};

export function speedupAtLeast(factor, extraJob = {}) {
  return {
    name: `Forge reaches the walk skill at least ${factor}x faster than the Python baseline`,
    timed: true,
    run: () => {
      if (!fs.existsSync(BASELINE_FILE)) return fail('No baseline recorded');

      const { seconds } = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
      const ratios = TTS_ROBOTS.map((robot) => {
        const forge = measure(
          (dir) => {
            const file = path.join(dir, 'job.json');

            fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), ...extraJob }));

            return runForge(dir);
          },
          robot,
          'tts-forge',
        );

        return seconds[robot] / forge;
      });
      const got = median(ratios);

      return got >= factor ? pass(`${got.toFixed(2)}x`, { ratios }) : fail(`${got.toFixed(2)}x`, { ratios });
    },
  };
}
