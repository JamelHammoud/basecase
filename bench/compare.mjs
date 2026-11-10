#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { argOption, defaultRunName, here, openStudio, root } from './harness.mjs';
import { gitInfo, readIndex } from './archive.mjs';
import { runMicroOnce } from './micro/once.mjs';
import { closeAppModules } from './micro/scenes.mjs';
import { runnable, selectTasks } from './micro/tasks/index.mjs';
import { resolveModel, servedMismatch, sharedEffort } from './compare/models.mjs';
import { historicalRunCost, nextPairFits, schedule } from './compare/plan.mjs';
import { compareStats } from './compare/stats.mjs';
import { compareMarkdown } from './compare/report.mjs';

const args = process.argv.slice(2);
const labels = argOption(args, 'models', '').split(',').filter(Boolean);
const seeds = Number(argOption(args, 'seeds', 2));
const budget = Number(argOption(args, 'budget', 20));
const split = (args.includes('--tune') && 'tune') || (args.includes('--heldout') && 'heldout') || 'all';
const ids = argOption(args, 'tasks', '').split(',').filter(Boolean);
const runName = argOption(args, 'run', `compare-${defaultRunName()}`);
const runsDir = path.join(here, 'runs');
const outRoot = path.join(runsDir, runName);
const tasks = selectTasks({ ids, split }).filter((t) => runnable(t));

if (labels.length !== 2) {
  console.error('Name two models: node bench/compare.mjs --models fable,opus [--seeds 2] [--budget 20]');
  process.exit(1);
}

const pairs = schedule({ tasks, models: labels, seeds });

function printPlan() {
  const perRun = historicalRunCost(
    readIndex(runsDir),
    tasks.map((t) => t.id),
  );
  const fits = perRun ? Math.min(pairs.length, Math.floor(budget / (2 * perRun))) : null;

  console.log(`${tasks.length} tasks × ${seeds} seeds = ${pairs.length} pairs, ${pairs.length * 2} agent runs.`);
  console.log(
    perRun
      ? `Past micro runs cost about $${perRun.toFixed(2)} each, so the $${budget} budget covers about ${fits} pairs.`
      : `No past micro runs to estimate cost from. The run stops before the pair that would pass $${budget}.`,
  );
}

if (args.includes('--dry')) {
  printPlan();
  process.exit(0);
}

const started = Date.now();
const log = (...a) => console.log(`[compare ${((Date.now() - started) / 1000).toFixed(0)}s]`, ...a);
const studio = await openStudio({ label: 'compare', port: Number(argOption(args, 'port', 5191)), log });
const git = gitInfo(root);

async function agentModels() {
  const deadline = Date.now() + 60000;

  for (;;) {
    const { models = [] } = await (await fetch(`${studio.base}/api/bridge/acp-status`)).json();
    const learned = models.every((m) => m.id === 'default' || m.effortLevels?.length);

    if (learned || Date.now() > deadline) return models;

    await new Promise((r) => setTimeout(r, 1000));
  }
}

const available = await agentModels();
const resolved = labels.map((l) => resolveModel(l, available));
const effort = sharedEffort(
  resolved.map((r) => available.find((m) => m.id === r.id)),
  argOption(args, 'effort', undefined),
);
const results = [];
const pairCosts = [];
const checked = new Set();
let spent = 0;
let stopped = false;

log(`comparing ${resolved.map((r) => `${r.arg} → ${r.id}`).join(' and ')} at effort ${effort ?? 'default'}`);
printPlan();

async function runModel({ task, seed }, label) {
  const m = resolved[labels.indexOf(label)];
  const outDir = path.join(outRoot, label, 'micro');

  try {
    const { grade, ...r } = await runMicroOnce({
      studio,
      task,
      seed,
      outDir,
      runsDir,
      runName,
      git,
      model: m.id,
      effort,
    });

    log(`${task.id} seed ${seed} ${label}: ${grade.status}, $${r.costUsd ?? '?'}, ${r.seconds}s, ${r.servedBy ?? '?'}`);

    return { ...r, model: label };
  } catch (err) {
    log(`${task.id} seed ${seed} ${label} failed: ${err.message}`);

    return { task: task.id, seed, status: 'error', model: label };
  }
}

function checkServed(run) {
  const m = resolved[labels.indexOf(run.model)];
  const problem = !checked.has(run.model) && run.servedBy ? servedMismatch(m, run.servedBy) : null;

  if (run.servedBy) checked.add(run.model);

  return problem;
}

async function runPair(pair) {
  const runs = [];

  for (const label of pair.order) {
    const run = await runModel(pair, label);
    const problem = checkServed(run);

    results.push(run);
    runs.push(run);

    if (problem) throw new Error(problem);
  }

  if (runs.every((r) => typeof r.costUsd !== 'number'))
    log(
      "The agent reported no cost for this pair, so the budget can't stop the run. Limit it with --tasks or --seeds.",
    );

  return runs.reduce((s, r) => s + (r.costUsd ?? 0), 0);
}

async function runPairs() {
  for (const pair of pairs) {
    if (!nextPairFits({ spent, pairCosts, budget })) return true;

    const pairCost = await runPair(pair);

    spent += pairCost;
    pairCosts.push(pairCost);
    fs.writeFileSync(
      path.join(outRoot, 'results.json'),
      JSON.stringify({ labels, resolved, effort, results }, null, 1),
    );
  }

  return false;
}

fs.mkdirSync(outRoot, { recursive: true });

try {
  stopped = await runPairs();
} catch (err) {
  log(`Stopped: ${err.message}`);
}

const stats = compareStats(results, labels);
const report = compareMarkdown({
  stats,
  models: resolved,
  labels,
  effort,
  plan: { done: pairCosts.length, total: pairs.length, budget },
  git,
  stopped,
});

fs.writeFileSync(
  path.join(outRoot, 'results.json'),
  JSON.stringify({ labels, resolved, effort, results, stats }, null, 1),
);
fs.writeFileSync(path.join(outRoot, 'report.md'), report + '\n');
console.log(`\n${report}\n\nSpent $${spent.toFixed(2)}. Saved to ${path.relative(root, outRoot)}/report.md`);

await studio.close();
await closeAppModules();
process.exit(0);
