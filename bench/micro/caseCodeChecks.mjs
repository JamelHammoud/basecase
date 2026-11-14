import { plural } from '../../electron/plural.mjs';
import { check } from './checks.mjs';

export const START_CASE = 'app';

export const codePanelsIn = (kase) => (kase?.console?.panels ?? []).filter((p) => p.kind === 'code');

export function codeCase(scene) {
  const cases = scene?.project?.cases ?? [];

  return cases.filter((c) => codePanelsIn(c).length).at(-1) ?? cases.find((c) => c.id === START_CASE) ?? null;
}

const label = (want) => (want.text ? String(want.text) : `${want.role} ${String(want.name)}`);

async function codeRun(ctx) {
  const kase = codeCase(ctx.after);

  if (!codePanelsIn(kase).length) return { problem: 'No code panel' };

  ctx.codeRun ??= ctx.adapters.codeApp(ctx, kase);

  return ctx.codeRun;
}

const listed = (lines, ok) => ({ pass: lines.length === 0, detail: lines.length ? lines.slice(0, 3).join('; ') : ok });

export const noUncaughtErrors = () =>
  check('No uncaught errors', async (ctx) => {
    const run = await codeRun(ctx);

    if (run.problem) return { pass: false, detail: run.problem };

    const errors = Object.entries(run.reports).flatMap(([id, r]) =>
      r ? r.errors.map((e) => `${id}${e.line ? `:${e.line}` : ''} ${e.message}`) : [`${id} never loaded`],
    );

    return listed(errors, `${plural(Object.keys(run.reports).length, 'panel')} ran`);
  });

export const noRefusedCalls = () =>
  check('No refused calls', async (ctx) => {
    const run = await codeRun(ctx);

    if (run.problem) return { pass: false, detail: run.problem };

    return listed(
      Object.entries(run.reports).flatMap(([id, r]) => (r?.refused ?? []).map((why) => `${id}: ${why}`)),
      'None refused',
    );
  });

export const controlsExist = (controls) =>
  check(`The named controls exist: ${controls.map(label).join(', ')}`, async (ctx) => {
    const run = await codeRun(ctx);

    if (run.problem) return { pass: false, detail: run.problem };

    const missing = run.controls.filter((c) => !c.found).map(label);

    return missing.length
      ? { pass: false, detail: `Lacks ${missing.join(', ')}` }
      : { pass: true, detail: 'All found' };
  });

export const simDoes = (what, { needs } = {}) =>
  check(`The sim does it: ${what}`, async (ctx) => {
    const run = await codeRun(ctx);

    if (run.problem) return { pass: false, detail: run.problem };

    if (needs) return { pass: null, detail: `${needs} named, not built`, adapter: needs };

    return run.sim ?? { pass: false, detail: 'Not measured' };
  });
