import { assemblyReport, serviceableIds } from '../assembly/assemblyReport';
import { rememberClamps } from '../assembly/clampCache';
import { clampsOf } from '../assembly/followers';
import { twinDifferences } from '../assembly/twinLint';
import type { Viewport3DHandle } from '../components/Viewport3D';
import type { ScenePart } from '../types/robotics';
import { designedFits } from '../utils/designedFits';

interface FitContext {
  parts: () => ScenePart[];
  viewport: () => Viewport3DHandle | null;
}

const NO_CLASHES = { interferences: [], coplanar: [] };

export async function chainsNow(ctx: FitContext) {
  const viewport = ctx.viewport();

  if (!viewport) return null;

  const chains = await viewport.fastenerChains();

  rememberClamps(ctx.parts(), clampsOf(chains));

  return chains;
}

const ASSEMBLY_BUDGET_MS = 30000;

export async function assemblyCheck(ctx: FitContext & { setAction: (action: string) => void }) {
  const viewport = ctx.viewport();

  if (!viewport) return { text: '' };

  ctx.setAction('Checking the assembly');

  const parts = ctx.parts();
  const geometry = await viewport.assembly({ serviceable: serviceableIds(parts), budgetMs: ASSEMBLY_BUDGET_MS });

  rememberClamps(parts, clampsOf(geometry.chains));

  const { text, plan, service, enclosing } = assemblyReport(parts, geometry);

  return { text, data: { screws: plan.screws, stuckParts: plan.stuckParts, service, enclosing } };
}

export async function sceneFits(payload: { ids?: string[]; twins?: boolean }, ctx: FitContext) {
  const viewport = ctx.viewport();
  const [found, chains] = await Promise.all([viewport?.interference(payload.ids) ?? NO_CLASHES, chainsNow(ctx)]);
  const fits = designedFits(found, ctx.parts(), chains);

  if (!payload.twins || !viewport) return fits;

  const twins = twinDifferences({ parts: ctx.parts(), clashes: fits.items, measures: await viewport.measureParts() });

  return { ...fits, twins };
}
