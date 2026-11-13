import { AdapterMissing } from './adapterMissing.mjs';
import { check } from './checks.mjs';

const caseIn = (scene, id) => scene?.project?.cases?.find((c) => c.id === id) ?? null;

const judged = (kase) => kase && JSON.stringify({ world: kase.world, reference: kase.reference, task: kase.task });

export const caseUnchanged = (id) =>
  check(`The ${id} Case is left as it was`, (ctx) => {
    const start = caseIn(ctx.before, id);
    const now = caseIn(ctx.after, id);

    if (!start) throw new AdapterMissing('cases', `the ${id} Case in the start scene`);

    if (!now) return { pass: false, detail: 'Deleted' };

    return judged(now) === judged(start) ? { pass: true, detail: 'Unchanged' } : { pass: false, detail: 'Edited' };
  });

const failureText = (failures = []) => failures.map((f) => `${f.label} ${f.runs}`).join(', ');

export function caseRunDetail(run) {
  const margin = typeof run.medianMargin === 'number' ? `, median margin ${run.medianMargin.toFixed(2)}` : '';
  const failures = run.failures?.length ? `; ${failureText(run.failures)}` : '';

  return `${run.passes} of ${run.runs} passed${margin}${failures}${run.refusal ? `; ${run.refusal}` : ''}`;
}

export const casePasses = (id) =>
  check(`The ${id} Checks row passes`, async (ctx) => {
    const run = await ctx.adapters.runCase(ctx, id);

    if (run.problem) return { pass: false, detail: run.problem };

    return { pass: run.status === 'pass', detail: `${run.status}: ${caseRunDetail(run)}` };
  });

export function bomChange(startUsd, nowUsd) {
  if (!Number.isFinite(startUsd) || startUsd <= 0 || !Number.isFinite(nowUsd)) return null;

  return nowUsd / startUsd - 1;
}

export const bomWithin = (share) =>
  check(`BOM within ${Math.round(share * 100)}% of the start`, async (ctx) => {
    if (typeof ctx.startBomUsd !== 'number')
      throw new AdapterMissing('bom', "the start scene's BOM from the running app");

    const { estimatedUsd } = await ctx.adapters.bom(ctx);
    const change = bomChange(ctx.startBomUsd, estimatedUsd);

    if (change === null) throw new AdapterMissing('bom', 'the BOM total');

    return {
      pass: Math.abs(change) <= share,
      detail: `~$${estimatedUsd} from ~$${ctx.startBomUsd} (${change >= 0 ? '+' : ''}${Math.round(change * 100)}%)`,
    };
  });
