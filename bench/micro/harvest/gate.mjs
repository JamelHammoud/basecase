import { gradeLine, gradeTask } from '../grade.mjs';
import { sanity } from '../sanity.mjs';
import { startRecord } from '../scenes.mjs';
import { harvestedTask } from './kinds.mjs';
import { coveredBy, stubFor } from './plan.mjs';

export async function existingCoverage(tasks, ctx) {
  const covered = [];

  for (const task of tasks.filter((t) => t.fixture)) {
    const start = await startRecord(task, ctx);
    const grade = await gradeTask(task, { before: start, after: start });

    covered.push(...coveredBy({ task, start, grade }));
  }

  return covered;
}

export async function gateFresh(fresh, ctx) {
  const passed = [];
  const dropped = [];

  for (const entry of fresh) {
    const task = harvestedTask(stubFor({ ...entry, id: 'H0', heldOut: false }));
    const rows = await sanity(task, ctx);
    const bad = rows.filter((r) => !r.ok || r.grade.status === 'unavailable');

    if (rows.length === 2 && !bad.length) passed.push(entry);
    else
      dropped.push({
        candidate: entry.candidate,
        reason: bad.length
          ? bad.map((r) => `${r.label}: ${gradeLine(task, r.grade)}`).join('; ')
          : 'No known fix to check the grader against',
      });
  }

  return { passed, dropped };
}
