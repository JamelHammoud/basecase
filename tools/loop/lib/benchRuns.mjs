import fs from 'node:fs';
import path from 'node:path';
import { readIndex } from '../../../bench/archive.mjs';
import { cachedRuns } from '../../../bench/compare/cache.mjs';
import { runnable, selectTasks } from '../../../bench/micro/tasks/index.mjs';
import { activeLessons, parsePlaybook, PLAYBOOK } from '../../../bench/playbook.mjs';
import { HOME_CHECKOUT, WORKTREES } from './paths.mjs';
import { run } from './sh.mjs';
import { clearPath, linkModules } from './worktree.mjs';
import { shortfall } from './weakness.mjs';

export const BENCH_RUNS = process.env.BASECASE_BENCH_RUNS || path.join(HOME_CHECKOUT, 'bench', 'runs');

export const SETTINGS = {
  model: process.env.BASECASE_HARNESS_MODEL || 'opus',
  served: process.env.BASECASE_HARNESS_SERVED || 'claude-opus-5-5',
  effort: process.env.BASECASE_HARNESS_EFFORT || 'high',
  seeds: 3,
  parallel: 2,
  port: 5290,
};

const BENCH_TIMEOUT_MS = 10 * 60 * 60 * 1000;

export function taskMeta() {
  const tasks = selectTasks().filter((task) => runnable(task));
  const tune = tasks.filter((task) => !task.heldOut);

  return {
    tune: tune.map((task) => task.id),
    heldout: tasks.filter((task) => task.heldOut).map((task) => task.id),
    categoryOf: Object.fromEntries(tune.map((task) => [task.id, task.category])),
    titleOf: Object.fromEntries(tasks.map((task) => [task.id, task.title])),
  };
}

const runsLink = (dir) => path.join(dir, 'bench', 'runs');

const isLink = (file) => fs.lstatSync(file, { throwIfNoEntry: false })?.isSymbolicLink() ?? false;

export function linkRuns(dir) {
  const link = runsLink(dir);

  fs.mkdirSync(BENCH_RUNS, { recursive: true });

  if (isLink(link)) return;

  fs.symlinkSync(BENCH_RUNS, link);
}

export function unlinkRuns(dir) {
  const link = runsLink(dir);

  if (isLink(link)) fs.unlinkSync(link);
}

export function openDetached(name, sha) {
  const dir = path.join(WORKTREES, name);

  clearPath(dir);
  run('git', ['worktree', 'add', '-q', '--detach', dir, sha], { cwd: HOME_CHECKOUT });
  linkModules(dir);
  linkRuns(dir);

  return { dir };
}

export const cachedFor = (harness) =>
  cachedRuns(readIndex(BENCH_RUNS), { harness, effort: SETTINGS.effort, served: SETTINGS.served });

export const microArgs = ({ split, tasks = [], seeds, name }) => [
  'bench/micro/run.mjs',
  `--${split}`,
  ...(tasks.length > 0 ? ['--tasks', tasks.join(',')] : []),
  '--seeds',
  String(seeds),
  '--model',
  SETTINGS.model,
  '--effort',
  SETTINGS.effort,
  '--parallel',
  String(SETTINGS.parallel),
  '--port',
  String(SETTINGS.port),
  '--run',
  name,
];

export function runMicro({ dir, log, ...plan }) {
  const args = microArgs(plan);

  log(`bench: node ${args.join(' ')}`);
  linkRuns(dir);

  const result = run(process.execPath, args, { cwd: dir, timeout: BENCH_TIMEOUT_MS, allowFail: true });

  if (!result.ok) log(`bench run ${plan.name} ended badly: ${result.err.slice(-500)}`);
}

export function ensureRuns({ dir, harness, split, ids, name, log }) {
  const missing = shortfall(cachedFor(harness), ids, SETTINGS.seeds);

  if (missing.tasks.length > 0) runMicro({ dir, log, split, tasks: missing.tasks, seeds: missing.seeds, name });

  return cachedFor(harness);
}

const seedDirIn = (base, entry) => path.join(base, 'micro', entry.task, `seed-${entry.seed}`);

export function runDir(entry) {
  const top = path.join(BENCH_RUNS, entry.run);
  const direct = seedDirIn(top, entry);

  if (fs.existsSync(direct)) return direct;

  const labelled = fs.existsSync(top)
    ? fs.readdirSync(top).map((label) => seedDirIn(path.join(top, label), entry))
    : [];

  return labelled.find((dir) => fs.existsSync(dir)) ?? null;
}

export function failedChecks(dir) {
  try {
    const grade = JSON.parse(fs.readFileSync(path.join(dir, 'grade.json'), 'utf8'));
    const failing = grade.checks
      .filter((check) => check.pass !== true)
      .map((check) => `${check.name}: ${check.detail}`);

    return [...failing, grade.detail].filter(Boolean).join('; ');
  } catch {
    return 'no grade.json';
  }
}

export function harnessLessons() {
  const text = fs.existsSync(PLAYBOOK) ? fs.readFileSync(PLAYBOOK, 'utf8') : '';

  return activeLessons(parsePlaybook(text)).filter((lesson) => lesson.tags.includes('harness'));
}
