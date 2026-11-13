#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { argOption, defaultRunName, here, root } from '../harness.mjs';
import { openSlotPool, runOnSlots } from '../slots.mjs';
import { gitInfo } from '../archive.mjs';
import { harnessKey } from '../compare/cache.mjs';
import { gradeLine } from './grade.mjs';
import { runMicroOnce } from './once.mjs';
import { closeAppModules } from './scenes.mjs';
import { selectTasks, runnable } from './tasks/index.mjs';
import { statsMarkdown, suiteStats } from './stats.mjs';

const args = process.argv.slice(2);
const ids = argOption(args, 'tasks', '').split(',').filter(Boolean);
const seeds = Number(argOption(args, 'seeds', 3));
const model = argOption(args, 'model', undefined);
const effort = argOption(args, 'effort', undefined);
const split = (args.includes('--tune') && 'tune') || (args.includes('--heldout') && 'heldout') || 'all';
const runName = argOption(args, 'run', `micro-${defaultRunName()}`);
const runsDir = path.join(here, 'runs');
const outRoot = path.join(runsDir, runName, 'micro');
const tasks = selectTasks({ ids, split, withStubs: args.includes('--stubs') }).filter((t) => runnable(t));

if (args.includes('--list')) {
  for (const t of selectTasks({ ids, split, withStubs: true }))
    console.log(
      `${t.id.padEnd(5)} ${t.heldOut ? 'held out' : 'tune    '} ${runnable(t) ? '' : '(needs a real scene) '}${t.title}`,
    );

  process.exit(0);
}

const started = Date.now();
const log = (...a) => console.log(`[micro ${((Date.now() - started) / 1000).toFixed(0)}s]`, ...a);
const pool = await openSlotPool({
  label: 'micro',
  port: Number(argOption(args, 'port', 5190)),
  parallel: Number(argOption(args, 'parallel', 4)),
  perApp: Number(argOption(args, 'per-app', 1)),
  log,
});
const git = gitInfo(root);
const results = [];

const out = { dir: outRoot, runsDir, runName, git };
const harness = harnessKey(root);

async function runOnce({ task, seed }, slot) {
  try {
    const { grade, ...r } = await runMicroOnce({ slot, task, seed, out, model, effort, harness });

    log(gradeLine(task, grade), `$${r.costUsd ?? '?'}`, `${r.seconds}s`, r.servedBy ?? '');
    results.push(r);
  } catch (err) {
    log(`${task.id} seed ${seed} failed: ${err.message}`);
    results.push({ task: task.id, category: task.category, heldOut: !!task.heldOut, seed, status: 'error' });
  }
}

const jobs = Array.from({ length: seeds }, (_, i) => tasks.map((task) => ({ task, seed: i + 1 }))).flat();

await runOnSlots(pool.slots, jobs, runOnce);

const stats = suiteStats(results);
const report = statsMarkdown(stats);

fs.mkdirSync(outRoot, { recursive: true });
fs.writeFileSync(path.join(outRoot, 'results.json'), JSON.stringify({ results, stats }, null, 1));
fs.writeFileSync(path.join(outRoot, 'report.md'), report + '\n');
console.log(report);

await pool.close();
await closeAppModules();
process.exit(0);
