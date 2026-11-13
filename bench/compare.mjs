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
import { canStart, historicalRunCost, roundJobs, settled } from './compare/plan.mjs';
import { cachedRuns, harnessKey, runFromCache } from './compare/cache.mjs';
import { compareStats } from './compare/stats.mjs';
import { compareMarkdown } from './compare/report.mjs';

const args = process.argv.slice(2);
const labels = argOption(args, 'models', '').split(',').filter(Boolean);
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

if (labels.length !== 2) {
  console.error('Name two models: node bench/compare.mjs --models claude-fable-5-2,claude-opus-5-5 [--budget 20]');
  process.exit(1);
}

const harness = harnessKey(root);
const index = readIndex(runsDir);
const perRunHistory = historicalRunCost(
  index,
  tasks.map((t) => t.id),
);

function cacheFor(model, effort) {
  const served = model.expectServed ?? (/^claude-/i.test(model.arg) ? model.arg : null);

  return opts.useCache ? cachedRuns(index, { harness, effort, served }) : new Map();
}

function printPlan(effort) {
  const reusable = labels.map((l) => {
    const byTask = cacheFor({ arg: l }, effort);

    return `${l}: ${tasks.filter((t) => byTask.get(t.id)?.length).length} of ${tasks.length} tasks cached`;
  });

  console.log(`Harness ${harness}. ${tasks.length} tasks, up to ${opts.maxRounds} rounds, ${opts.parallel} at a time.`);
  console.log(`Reusable from earlier runs at effort ${effort ?? 'default'}: ${reusable.join('; ')}.`);
  console.log(
    perRunHistory
      ? `Past micro runs cost about $${perRunHistory.toFixed(2)} each; the $${opts.budget} budget covers about ${Math.floor(opts.budget / perRunHistory)} live runs.`
      : `No past micro runs to estimate cost from. Runs stop before passing $${opts.budget}.`,
  );
}

if (args.includes('--dry')) {
  printPlan(argOption(args, 'effort', 'high'));
  process.exit(0);
}

const started = Date.now();
const log = (...a) => console.log(`[compare ${((Date.now() - started) / 1000).toFixed(0)}s]`, ...a);
const pool = await openSlotPool({
  label: 'compare',
  port: Number(argOption(args, 'port', 5191)),
  parallel: opts.parallel,
  perApp: Number(argOption(args, 'per-app', 1)),
  log,
});
const git = gitInfo(root);
const { models: available = [] } = await (await fetch(`${pool.studios[0].base}/api/bridge/acp-status`)).json();
const resolved = labels.map((l) => resolveModel(l, available));
const effort = sharedEffort(
  resolved.map((r) => available.find((m) => m.id === r.id)),
  argOption(args, 'effort', undefined),
);
const caches = resolved.map((m) => cacheFor(m, effort));
const state = { spent: 0, inflight: 0, liveCosts: [], stop: null, verified: new Set() };
const results = [];
const out = { dir: '', runsDir, runName, git };

log(`${resolved.map((r) => `${r.arg} → ${r.id}`).join(' and ')} at effort ${effort ?? 'default'}`);
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

  const model = resolved[labels.indexOf(label)];

  state.inflight++;

  try {
    const { grade, ...r } = await runMicroOnce({
      slot,
      task,
      seed,
      out: { ...out, dir: path.join(outRoot, label, 'micro') },
      model: model.id,
      effort,
      harness,
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

async function runRound(seed) {
  const jobs = roundJobs({ tasks, labels, seed });
  const live = [];

  for (const job of jobs) {
    const cached = caches[labels.indexOf(job.label)].get(job.task.id)?.[seed - 1];

    if (cached) results.push({ ...runFromCache(cached, job.label), seed });
    else live.push(job);
  }

  log(`round ${seed}: ${live.length} live runs, ${jobs.length - live.length} reused`);
  await runOnSlots(pool.slots, live, async (job, slot) => recordLive(await liveRun(job, slot)));
  fs.writeFileSync(path.join(outRoot, 'results.json'), JSON.stringify({ labels, resolved, effort, results }, null, 1));
}

fs.mkdirSync(outRoot, { recursive: true });

let rounds = 0;

while (rounds < opts.maxRounds && !state.stop) {
  rounds++;
  await runRound(rounds);
  state.stop ??= settled(compareStats(results, labels), opts);
}

const stats = compareStats(results, labels);
const plan = { ...opts, harness, rounds, tasks: tasks.length, stop: state.stop ?? 'rounds' };
const report = compareMarkdown({ stats, models: resolved, labels, effort, plan, git });

fs.writeFileSync(
  path.join(outRoot, 'results.json'),
  JSON.stringify({ labels, resolved, effort, results, stats }, null, 1),
);
fs.writeFileSync(path.join(outRoot, 'report.md'), report + '\n');
console.log(`\n${report}\n\nSaved to ${path.relative(root, outRoot)}/report.md`);

await pool.close();
await closeAppModules();
process.exit(0);
