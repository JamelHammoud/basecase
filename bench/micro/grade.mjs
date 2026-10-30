import { withAdapters } from './adapters.mjs';

export async function gradeTask(task, { before, after, answer = '', app = null, adapters } = {}) {
  const ctx = { task, before, after, answer, app, adapters: withAdapters(adapters) };

  try {
    const result = await task.grade(ctx);
    const minimal = result.checks.filter((c) => c.minimal).map((c) => c.name);
    const needs = [...new Set(result.checks.map((c) => c.adapter).filter(Boolean))];

    return { ...result, ...(minimal.length ? { minimal } : {}), ...(needs.length ? { needs } : {}) };
  } catch (err) {
    return { status: 'error', checks: [], detail: String(err?.stack ?? err) };
  }
}

export function gradeLine(task, grade) {
  const failing = grade.checks.filter((c) => c.pass !== true).map((c) => `${c.name}: ${c.detail}`);

  return `${task.id} ${grade.status}${failing.length ? ` (${failing.join('; ')})` : ''}${grade.detail ? ` ${grade.detail}` : ''}`;
}
