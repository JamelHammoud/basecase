import fs from 'node:fs';
import path from 'node:path';
import { gradeTask, startFacts } from './grade.mjs';
import { solutionRecord, startRecord } from './scenes.mjs';

export async function appFor(studio, scene) {
  if (!studio) return null;

  await studio.page.evaluate((r) => window.__studio.load(r), scene);
  await new Promise((r) => setTimeout(r, 800));

  return { call: studio.call };
}

export async function sanity(task, ctx, saveDir = null) {
  const before = await startRecord(task, ctx);
  const rows = [];

  if (saveDir) {
    fs.mkdirSync(path.join(saveDir, task.id), { recursive: true });
    fs.writeFileSync(path.join(saveDir, task.id, 'start.json'), JSON.stringify(before));
  }

  const startApp = await appFor(ctx.studio, before);
  const facts = await startFacts(task, startApp);
  const start = await gradeTask(task, { before, after: before, app: startApp, ...facts });

  rows.push({ task, label: 'start', grade: start, ok: start.status !== 'pass' && start.status !== 'error' });

  const fixed = (await solutionRecord(task, ctx, before)) ?? (task.solutionAnswer ? before : null);

  if (fixed) {
    const grade = await gradeTask(task, {
      before,
      after: fixed,
      answer: task.solutionAnswer,
      app: await appFor(ctx.studio, fixed),
      ...facts,
    });

    rows.push({ task, label: 'solution', grade, ok: grade.status === 'pass' || grade.status === 'unavailable' });
  }

  return rows;
}
