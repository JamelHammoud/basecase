#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { argOption, here, openStudio } from '../harness.mjs';
import { gradeLine, gradeTask } from './grade.mjs';
import { closeAppModules, readJson, solutionRecord, specToPartFn, startRecord } from './scenes.mjs';
import { selectTasks } from './tasks/index.mjs';

const args = process.argv.slice(2);
const ids = argOption(args, 'tasks', '').split(',').filter(Boolean);
const scenesDir = argOption(args, 'scenes', null);
const regrade = argOption(args, 'regrade', null);
const saveDir = argOption(args, 'save', null);
const withApp = args.includes('--with-app');
const split = (args.includes('--tune') && 'tune') || (args.includes('--heldout') && 'heldout') || 'all';

function savedScenes(task) {
  if (regrade) {
    const dir = path.join(here, 'runs', regrade, 'micro', task.id);

    return fs.existsSync(dir)
      ? fs
          .readdirSync(dir)
          .filter((d) => fs.existsSync(path.join(dir, d, 'scene.json')))
          .map((d) => path.join(dir, d))
      : [];
  }

  const dir = path.join(path.resolve(scenesDir), task.id);
  const flat = path.join(path.resolve(scenesDir), `${task.id}.json`);

  if (fs.existsSync(path.join(dir, 'scene.json'))) return [dir];

  return fs.existsSync(flat) ? [flat] : [];
}

function readSaved(where) {
  if (where.endsWith('.json')) return { after: readJson(where) };

  const opt = (f) => (fs.existsSync(path.join(where, f)) ? path.join(where, f) : null);

  return {
    after: readJson(path.join(where, 'scene.json')),
    before: opt('start.json') && readJson(opt('start.json')),
    answer: opt('answer.md') ? fs.readFileSync(opt('answer.md'), 'utf8') : '',
  };
}

async function appFor(studio, scene) {
  if (!studio) return null;

  await studio.page.evaluate((r) => window.__studio.load(r), scene);
  await new Promise((r) => setTimeout(r, 800));

  return { call: studio.call };
}

async function sanity(task, ctx) {
  const before = await startRecord(task, ctx);
  const rows = [];

  if (saveDir) {
    fs.mkdirSync(path.join(saveDir, task.id), { recursive: true });
    fs.writeFileSync(path.join(saveDir, task.id, 'start.json'), JSON.stringify(before));
  }

  const start = await gradeTask(task, { before, after: before, app: await appFor(ctx.studio, before) });

  rows.push({ task, label: 'start', grade: start, ok: start.status !== 'pass' && start.status !== 'error' });

  const fixed = (await solutionRecord(task, ctx)) ?? (task.solutionAnswer ? before : null);

  if (fixed) {
    const grade = await gradeTask(task, {
      before,
      after: fixed,
      answer: task.solutionAnswer,
      app: await appFor(ctx.studio, fixed),
    });

    rows.push({ task, label: 'solution', grade, ok: grade.status === 'pass' || grade.status === 'unavailable' });
  }

  return rows;
}

async function graded(task, ctx) {
  const rows = [];

  for (const where of savedScenes(task)) {
    const saved = readSaved(where);
    const before = saved.before ?? (await startRecord(task, ctx));
    const grade = await gradeTask(task, { ...saved, before, app: await appFor(ctx.studio, saved.after) });

    if (regrade) fs.writeFileSync(path.join(where, 'grade.json'), JSON.stringify(grade, null, 1));

    rows.push({ task, label: path.basename(where), grade, ok: grade.status !== 'error' });
  }

  return rows;
}

const studio = withApp
  ? await openStudio({ label: 'micro-dry', port: Number(argOption(args, 'port', 5196)), agent: false })
  : null;
const ctx = { studio, specToPart: await specToPartFn() };
const mode = scenesDir || regrade ? graded : sanity;
const tasks = selectTasks({ ids, split }).filter((t) => t.fixture || scenesDir || regrade);
let bad = 0;

for (const task of tasks) {
  for (const row of await mode(task, ctx)) {
    bad += row.ok ? 0 : 1;
    console.log(`${row.ok ? ' ' : '!'} ${row.label.padEnd(9)} ${gradeLine(task, row.grade)}`);
  }
}

await studio?.close();
await closeAppModules();
console.log(bad ? `${bad} unexpected results` : 'All graders behaved');
process.exit(bad ? 1 : 0);
