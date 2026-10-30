#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { argOption, defaultRunName, here, openStudio, root, sceneRecordOf } from '../harness.mjs';
import { createEventHandler } from '../run-events.mjs';
import { answerText, readEvents, runMetrics } from '../metrics.mjs';
import { archiveRun, gitInfo } from '../archive.mjs';
import { gradeLine, gradeTask } from './grade.mjs';
import { loadFixtureInApp } from './materialize.mjs';
import { closeAppModules, readJson } from './scenes.mjs';
import { selectTasks, runnable, startSceneFile } from './tasks/index.mjs';
import { statsMarkdown, suiteStats } from './stats.mjs';

const args = process.argv.slice(2);
const ids = argOption(args, 'tasks', '').split(',').filter(Boolean);
const seeds = Number(argOption(args, 'seeds', 3));
const split = (args.includes('--tune') && 'tune') || (args.includes('--heldout') && 'heldout') || 'all';
const runName = argOption(args, 'run', `micro-${defaultRunName()}`);
const outRoot = path.join(here, 'runs', runName, 'micro');
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
const studio = await openStudio({ label: 'micro', port: Number(argOption(args, 'port', 5190)), log });
const git = gitInfo(root);
const results = [];

async function startScene(task) {
  const file = startSceneFile(task);

  return loadFixtureInApp({
    page: studio.page,
    call: studio.call,
    fixture: file ? null : task.fixture(),
    record: file ? readJson(file) : null,
  });
}

async function runOnce(task, seed) {
  const dir = path.join(outRoot, task.id, `seed-${seed}`);

  fs.mkdirSync(dir, { recursive: true });
  await studio.post('/api/bridge/acp-new-conversation', {});

  const before = await startScene(task);
  const logFile = fs.createWriteStream(path.join(dir, 'events.jsonl'));
  const t0 = Date.now();

  fs.writeFileSync(path.join(dir, 'start.json'), JSON.stringify(before));
  studio.onEvent.current = createEventHandler({
    counts: { toolCalls: 0, modelPart: 0, failedTools: 0, thoughtChunks: 0, messageChunks: 0 },
    log: () => {},
    logFile,
    started: t0,
  });

  const result = await studio.post('/api/bridge/acp-prompt', { promptText: task.instruction });
  const seconds = Math.round((Date.now() - t0) / 1000);

  await new Promise((r) => setTimeout(r, 1500));
  studio.onEvent.current = null;
  await new Promise((r) => logFile.end(r));

  const records = readEvents(path.join(dir, 'events.jsonl'));
  const answer = answerText(records);
  const after = await sceneRecordOf(studio.page);
  const grade = await gradeTask(task, { before, after, answer, app: { call: studio.call } });
  const summary = {
    task: task.id,
    seed,
    heldOut: !!task.heldOut,
    grade: grade.status,
    metrics: runMetrics(records, { result, seconds }),
  };

  fs.writeFileSync(path.join(dir, 'answer.md'), answer);
  fs.writeFileSync(path.join(dir, 'grade.json'), JSON.stringify(grade, null, 1));
  archiveRun({
    runsDir: path.join(here, 'runs'),
    run: runName,
    task: task.id,
    kind: 'micro',
    dir,
    summary,
    scene: after,
    git,
  });
  log(gradeLine(task, grade), `$${summary.metrics.costUsd ?? '?'}`, `${seconds}s`);

  return {
    task: task.id,
    category: task.category,
    heldOut: !!task.heldOut,
    seed,
    status: grade.status,
    costUsd: summary.metrics.costUsd,
    seconds,
  };
}

for (const task of tasks) {
  for (let seed = 1; seed <= seeds; seed++) {
    try {
      results.push(await runOnce(task, seed));
    } catch (err) {
      log(`${task.id} seed ${seed} failed: ${err.message}`);
      results.push({ task: task.id, category: task.category, heldOut: !!task.heldOut, seed, status: 'error' });
    }
  }
}

const stats = suiteStats(results);
const report = statsMarkdown(stats);

fs.mkdirSync(outRoot, { recursive: true });
fs.writeFileSync(path.join(outRoot, 'results.json'), JSON.stringify({ results, stats }, null, 1));
fs.writeFileSync(path.join(outRoot, 'report.md'), report + '\n');
console.log(report);

await studio.close();
await closeAppModules();
process.exit(0);
