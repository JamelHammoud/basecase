#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { argOption, defaultRunName, here, root } from './harness.mjs';
import { gitInfo, readIndex } from './archive.mjs';
import { openSlotPool, runOnSlots } from './slots.mjs';
import { runMicroOnce } from './micro/once.mjs';
import { closeAppModules } from './micro/scenes.mjs';
import { runnable, selectTasks } from './micro/tasks/index.mjs';
import { resolveModel, servedMismatch, sharedEffort } from './compare/models.mjs';
import { canStart, historicalRunCost, liveRunsPlanned, roundJobs, settled, splitSlots } from './compare/plan.mjs';
import { harnessKey, runFromCache } from './compare/cache.mjs';
import { againstArms, armCache, DEFAULT_MODEL, dirOf, modelArms } from './compare/arms.mjs';
import { checkoutRef, refFromArgs } from './compare/against.mjs';
import { compareStats } from './compare/stats.mjs';
import { compareMarkdown } from './compare/report.mjs';

const args = process.argv.slice(2);
const against = args.includes('--against') ? refFromArgs(args) : null;
const opts = {
  maxRounds: Number(argOption(args, 'seeds', 3)),
  budget: Number(argOption(args, 'budget', 20)),
  parallel: Number(argOption(args, 'parallel', 8)),
  margin: Number(argOption(args, 'margin', 0.1)),
  useCache: !args.includes('--no-cache'),
};
const split = (args.includes('--tune') && 'tune') || (args.includes('--heldout') && 'heldout') || 'all';
const ids = argOption(args, 'tasks', '').split(',').filter(Boolean);
const runName = argOption(args, 'run', `compare-${defaultRunName()}`);
const runsDir = path.join(here, 'runs');
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
  console.log(`Reusable from earlier runs at effort ${effort ?? 'default'}: ${reusable.join('; ')}.`);
  console.log(costLine(liveRunsPlanned({ tasks, rounds: opts.maxRounds, caches })));
}

if (args.includes('--dry')) {
  printPlan(wantedEffort ?? 'high');
  process.exit(0);
}

const started = Date.now();
const log = (...a) => console.log(`[compare ${((Date.now() - started) / 1000).toFixed(0)}s]`, ...a);
const port = Number(argOption(args, 'port', 5191));
const perApp = Number(argOption(args, 'per-app', 1));

async function openPools() {
  if (!against) {
    const pool = await openSlotPool({ label: 'compare', port, parallel: opts.parallel, perApp, log });

    arms.forEach((arm) => (arm.slots = pool.slots));

    return [pool];
  }

  const live = liveRunsPlanned({ tasks, rounds: opts.maxRounds, caches: cachesAt(wantedEffort) });
  const sizes = splitSlots(opts.parallel, live);
  const pools = [];

  for (const [i, arm] of arms.entries()) {
    if (!sizes[i]) continue;

    const label = `compare-${dirOf(arm.label)}`;
    const pool = await openSlotPool({ label, port, parallel: sizes[i], perApp, source: arm.source, log });

    arm.slots = pool.slots;
    pools.push(pool);
  }

  return pools;
}

const pools = await openPools();
const { models: available = [] } = await (await fetch(`${pools[0].studios[0].base}/api/bridge/acp-status`)).json();
const resolved = arms.map((arm) => resolveModel(arm.model, available));
const effort = sharedEffort(
  resolved.map((r) => available.find((m) => m.id === r.id)),
  wantedEffort,
);
const caches = cachesAt(effort);
const state = { spent: 0, inflight: 0, liveCosts: [], stop: null, verified: new Set() };
const results = [];

log(`${resolved.map((r, i) => `${labels[i]}: ${r.arg} → ${r.id}`).join(', ')} at effort ${effort ?? 'default'}`);
printPlan(effort);

const perRunEstimate = () =>
  state.liveCosts.length ? state.liveCosts.reduce((a, b) => a + b, 0) / state.liveCosts.length : perRunHistory;

function noteServed(run, model) {
  if (!run.servedBy || state.verified.has(model.arg)) return;

  state.verified.add(model.arg);

  const problem = servedMismatch(model, run.servedBy);

  if (problem) {
    log(problem);
    state.stop = 'served';
  }
}

async function liveRun({ task, seed, label }, slot) {
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
      out: { dir: path.join(outRoot, dirOf(label), 'micro'), runsDir, runName, git: arm.git },
      model: model.id,
      effort,
      harness: arm.harness,
    });

    log(`${task.id} seed ${seed} ${label}: ${grade.status}, $${r.costUsd ?? '?'}, ${r.seconds}s, ${r.servedBy ?? '?'}`);
    noteServed(r, model);

    return { ...r, model: label };
  } catch (err) {
    log(`${task.id} seed ${seed} ${label} failed: ${err.message}`);

    return { task: task.id, seed, status: 'error', model: label };
  } finally {
    state.inflight--;
  }
}

function recordLive(run) {
  if (!run) return;

  results.push(run);
  state.spent += run.costUsd ?? 0;

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

  const runJob = async (job, slot) => recordLive(await liveRun(job, slot));

  return Promise.all([...bySlots].map(([slots, jobs]) => runOnSlots(slots, jobs, runJob)));
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

fs.mkdirSync(outRoot, { recursive: true });

let rounds = 0;

while (rounds < opts.maxRounds && !state.stop) {
  rounds++;
  await runRound(rounds);
  state.stop ??= settled(compareStats(results, labels), opts);
}

const stats = compareStats(results, labels);
const plan = {
  ...opts,
  harness: arms[0].harness,
  arms: against ? armSummary() : null,
  rounds,
  tasks: tasks.length,
  stop: state.stop ?? 'rounds',
};
const report = compareMarkdown({ stats, models: resolved, labels, effort, plan, git: arms[0].git });

writeResults({ stats, plan });
fs.writeFileSync(path.join(outRoot, 'report.md'), report + '\n');
console.log(`\n${report}\n\nSaved to ${path.relative(root, outRoot)}/report.md`);

await Promise.all(pools.map((pool) => pool.close()));
await closeAppModules();
process.exit(0);
