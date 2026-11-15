#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { argOption, defaultRunName, here, root } from './harness.mjs';
import { gitInfo, readIndex } from './archive.mjs';
import { openSlotPool } from './slots.mjs';
import { bounded, comparisonLimits, guardedOutput, runBoundedJobs } from './compare/runtime.mjs';
import { runMicroOnce } from './micro/once.mjs';
import { closeAppModules } from './micro/scenes.mjs';
import { runnable, selectTasks } from './micro/tasks/index.mjs';
import { resolveModel, runModelProblem, sharedEffort } from './compare/models.mjs';
import { canStart, historicalRunCost, liveRunsPlanned, roundJobs, settled, splitSlots } from './compare/plan.mjs';
import { harnessKey, runFromCache } from './compare/cache.mjs';
import { againstArms, armCache, DEFAULT_MODEL, dirOf, modelArms } from './compare/arms.mjs';
import { checkoutRef, refFromArgs } from './compare/against.mjs';
import { compareStats } from './compare/stats.mjs';
import { compareMarkdown } from './compare/report.mjs';

const started = Date.now() - Math.round(process.uptime() * 1000);
const args = process.argv.slice(2);
const against = args.includes('--against') ? refFromArgs(args) : null;
const opts = {
  ...comparisonLimits(args),
  maxRounds: Number(argOption(args, 'seeds', 3)),
  budget: Number(argOption(args, 'budget', 20)),
  parallel: Number(argOption(args, 'parallel', 8)),
  margin: Number(argOption(args, 'margin', 0.1)),
  useCache: !args.includes('--no-cache'),
};
const split = (args.includes('--tune') && 'tune') || (args.includes('--heldout') && 'heldout') || 'all';
const ids = argOption(args, 'tasks', '').split(',').filter(Boolean);
const runName = argOption(args, 'run', `compare-${defaultRunName()}`);
const runsDir = path.resolve(argOption(args, 'runs-dir', path.join(here, 'runs')));
const outRoot = path.join(runsDir, runName);
const tasks = selectTasks({ ids, split }).filter((t) => runnable(t));
const wantedEffort = argOption(args, 'effort', against ? 'high' : undefined);

const NO_ARMS =
  'Name two models (node bench/compare.mjs --models claude-fable-5-2,claude-opus-5-5) or a harness to compare against (--against main).';

function buildModelArms() {
  const labels = argOption(args, 'models', '').split(',').filter(Boolean);

  if (labels.length !== 2) throw new Error(NO_ARMS);

  return { arms: modelArms({ labels, harness: harnessKey(root), source: root, git: gitInfo(root) }) };
}

function buildArms() {
  if (!against) return buildModelArms();

  const ref = checkoutRef({ cwd: root, ref: against });

  process.on('exit', ref.remove);
  process.once('SIGINT', () => process.exit(130));
  process.once('SIGTERM', () => process.exit(143));

  return {
    ref,
    arms: againstArms({ model: argOption(args, 'model', DEFAULT_MODEL), tree: root, ref, gitOf: gitInfo }),
  };
}

let built;

try {
  built = buildArms();
} catch (err) {
  console.error(err.message);

  if (!args.includes('--dry')) {
    fs.mkdirSync(outRoot, { recursive: true });
    fs.writeFileSync(
      path.join(outRoot, 'results.json'),
      JSON.stringify({ results: [], plan: { ...opts, stop: 'error' }, error: err.message }, null, 1),
    );
    fs.writeFileSync(path.join(outRoot, 'report.md'), `# Comparison failed\n\n${err.message}\n`);
  }

  process.exit(1);
}

const { arms } = built;
const labels = arms.map((arm) => arm.label);
const index = readIndex(runsDir);
const perRunHistory = historicalRunCost(
  index,
  tasks.map((t) => t.id),
);
const cachesAt = (effort) => arms.map((arm) => armCache(index, arm, { effort, useCache: opts.useCache }));
const money = (v) => `$${v.toFixed(2)}`;

function harnessLine() {
  if (!against) return `Harness ${arms[0].harness}.`;

  const [tree, ref] = arms;

  return `The working tree (harness ${tree.harness}) against ${ref.label} at ${built.ref.commit.slice(0, 7)} (harness ${ref.harness}), both on ${tree.model}.`;
}

function costLine(live) {
  const total = live.reduce((a, b) => a + b, 0);
  const runs = `Up to ${total} live runs (${labels.map((l, i) => `${live[i]} ${l}`).join(', ')}).`;

  if (!perRunHistory)
    return `${runs} No past micro runs to estimate cost from. Runs stop before passing $${opts.budget}.`;

  return `${runs} Past micro runs cost about ${money(perRunHistory)} each, so up to about ${money(total * perRunHistory)}; runs stop before passing $${opts.budget}.`;
}

function printPlan(effort) {
  const caches = cachesAt(effort);
  const reusable = arms.map((arm, i) =>
    arm.cache
      ? `${arm.label}: ${tasks.filter((t) => caches[i].get(t.id)?.length).length} of ${tasks.length} tasks cached`
      : `${arm.label}: always live`,
  );

  console.log(harnessLine());
  console.log(`${tasks.length} tasks, up to ${opts.maxRounds} rounds, ${opts.parallel} at a time.`);
  console.log(`Wall budget ${opts.minutes} minutes including startup, task cap ${opts.taskSeconds} seconds.`);
  console.log(`Reusable from earlier runs at effort ${effort ?? 'default'}: ${reusable.join('; ')}.`);
  console.log(costLine(liveRunsPlanned({ tasks, rounds: opts.maxRounds, caches })));
}

if (args.includes('--dry')) {
  printPlan(wantedEffort ?? 'high');
  process.exit(0);
}

const wallDeadline = started + opts.minutes * 60000;
const cleanupReserveSeconds = Math.min(5, opts.minutes * 6);
const deadline = wallDeadline - cleanupReserveSeconds * 1000;
const log = (...a) => console.log(`[compare ${((Date.now() - started) / 1000).toFixed(0)}s]`, ...a);
const port = Number(argOption(args, 'port', 5191));
const perApp = Number(argOption(args, 'per-app', 1));

async function openPools() {
  if (!against) {
    const pool = await bounded(() => openSlotPool({ label: 'compare', port, parallel: opts.parallel, perApp, log }), {
      deadline,
      late: (pool) => pool.close(),
    });

    pools.push(pool);

    arms.forEach((arm) => (arm.slots = pool.slots));

    return [pool];
  }

  const live = liveRunsPlanned({ tasks, rounds: opts.maxRounds, caches: cachesAt(wantedEffort) });
  const sizes = splitSlots(opts.parallel, live);

  for (const [i, arm] of arms.entries()) {
    if (!sizes[i]) continue;

    const label = `compare-${dirOf(arm.label)}`;
    const pool = await bounded(
      () => openSlotPool({ label, port, parallel: sizes[i], perApp, source: arm.source, log }),
      { deadline, late: (pool) => pool.close() },
    );

    arm.slots = pool.slots;
    pools.push(pool);
  }

  return pools;
}

const pools = [];
let resolved = arms.map((arm) => ({ arg: arm.model, id: arm.model }));
let effort = wantedEffort;
let caches = cachesAt(effort);
const state = { spent: 0, inflight: 0, liveCosts: [], stop: null, detail: null };
const results = [];
let rounds = 0;
let failure = null;

async function setup() {
  await openPools();

  const status = await bounded(
    async (signal) => {
      const response = await fetch(`${pools[0].studios[0].base}/api/bridge/acp-status`, { signal });

      return response.json();
    },
    { deadline },
  );
  const available = status.models ?? [];

  resolved = arms.map((arm) => resolveModel(arm.model, available));
  effort = sharedEffort(
    resolved.map((r) => available.find((m) => m.id === r.id)),
    wantedEffort,
  );
  caches = cachesAt(effort);
  log(`${resolved.map((r, i) => `${labels[i]}: ${r.arg} → ${r.id}`).join(', ')} at effort ${effort ?? 'default'}`);
  printPlan(effort);
}

const perRunEstimate = () =>
  state.liveCosts.length ? state.liveCosts.reduce((a, b) => a + b, 0) / state.liveCosts.length : perRunHistory;

function noteServed(run, model) {
  const problem = runModelProblem(run, model);

  if (problem) {
    log(problem);
    state.stop = 'served';
    state.detail = problem;
  }

  return problem;
}

async function liveRun({ task, seed, label }, slot, signal) {
  if (state.stop || !canStart({ ...state, perRun: perRunEstimate(), budget: opts.budget })) {
    state.stop ??= 'budget';

    return null;
  }

  const arm = arms[labels.indexOf(label)];
  const model = resolved[labels.indexOf(label)];

  state.inflight++;

  try {
    const { grade, ...r } = await runMicroOnce({
      slot,
      task,
      seed,
      out: guardedOutput(
        { dir: path.join(outRoot, dirOf(label), 'micro'), runsDir, runName, git: arm.git },
        signal,
        Math.min(deadline, Date.now() + opts.taskSeconds * 1000),
      ),
      model: model.id,
      effort,
      harness: arm.harness,
    });

    signal.throwIfAborted();

    log(`${task.id} seed ${seed} ${label}: ${grade.status}, $${r.costUsd ?? '?'}, ${r.seconds}s, ${r.servedBy ?? '?'}`);

    const problem = noteServed(r, model);

    return { ...r, model: label, ...(problem ? { status: 'error', detail: problem } : {}) };
  } finally {
    state.inflight--;
  }
}

function recordLive(run) {
  if (!run) return;

  results.push(run);
  state.spent += run.costUsd ?? 0;

  if (run.detail) log(`${run.task} seed ${run.seed} ${run.model}: ${run.status}, ${run.detail}`);

  if (typeof run.costUsd === 'number') state.liveCosts.push(run.costUsd);
}

const armSummary = () => arms.map(({ label, harness, git }) => ({ label, harness, git }));

function writeResults(extra = {}) {
  fs.writeFileSync(
    path.join(outRoot, 'results.json'),
    JSON.stringify({ labels, resolved, effort, arms: armSummary(), results, ...extra }, null, 1),
  );
}

function runLiveJobs(live) {
  const bySlots = new Map();

  for (const job of live) {
    const { slots } = arms[labels.indexOf(job.label)];

    bySlots.set(slots, [...(bySlots.get(slots) ?? []), job]);
  }

  return Promise.all(
    [...bySlots].map(([slots, jobs]) =>
      runBoundedJobs({
        slots,
        jobs,
        run: liveRun,
        record: recordLive,
        state,
        deadline,
        taskSeconds: opts.taskSeconds,
      }),
    ),
  );
}

async function runRound(seed) {
  const jobs = roundJobs({ tasks, labels, seed });
  const live = [];

  for (const job of jobs) {
    const cached = caches[labels.indexOf(job.label)].get(job.task.id)?.[seed - 1];

    if (cached) results.push({ ...runFromCache(cached, job.label), seed });
    else live.push(job);
  }

  log(`round ${seed}: ${live.length} live runs, ${jobs.length - live.length} reused`);
  await runLiveJobs(live);
  writeResults();
}

function finish() {
  const stats = compareStats(results, labels);
  const plan = {
    ...opts,
    harness: arms[0].harness,
    arms: against ? armSummary() : null,
    rounds,
    tasks: tasks.length,
    elapsedSeconds: (Date.now() - started) / 1000,
    cleanupReserveSeconds,
    stop: state.stop ?? 'rounds',
  };
  const report = compareMarkdown({
    stats,
    models: resolved,
    labels,
    effort,
    plan,
    git: arms[0].git,
    error: failure?.message ?? state.detail,
  });

  writeResults({ stats, plan, error: failure?.message ?? state.detail });
  fs.writeFileSync(path.join(outRoot, 'report.md'), report + '\n');
  console.log(`\n${report}\n\nSaved to ${path.relative(root, outRoot)}/report.md`);

  return { stats, plan, error: failure?.message ?? state.detail };
}

fs.mkdirSync(outRoot, { recursive: true });
writeResults({ plan: { ...opts, stop: 'starting' } });

try {
  await setup();

  while (rounds < opts.maxRounds && !state.stop) {
    if (Date.now() >= deadline) {
      state.stop = 'deadline';

      break;
    }

    rounds++;
    await runRound(rounds);

    if (Date.now() >= deadline) state.stop ??= 'deadline';

    state.stop ??= settled(compareStats(results, labels), opts);
  }
} catch (err) {
  failure = err;
  state.stop = err.code === 'deadline' ? 'deadline' : 'error';
  log(err.message);
} finally {
  const final = finish();
  const closing = Promise.allSettled([
    ...pools.map((pool) => pool.close()),
    closeAppModules(),
    Promise.resolve().then(() => built.ref?.remove()),
  ]);

  log('closing comparison resources');
  await bounded(() => closing, { deadline: wallDeadline }).catch(() => {});
  final.plan.elapsedSeconds = (Date.now() - started) / 1000;
  writeResults(final);
  log('comparison resources closed or wall deadline reached');
}

process.exit(failure && state.stop !== 'deadline' ? 1 : 0);
