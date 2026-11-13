import { sceneObjects, type AgentObject } from '../agent/agentDrive';
import type { CaseSpec } from '../cases/caseBuilder';
import type { GoalKind, GoalValues, ParamKey } from '../cases/caseGoals';
import type { WorldKind } from '../cases/caseWorlds';
import type { WorldObject } from '../cases/schema';
import type { CompileResult } from '../routines/compile';
import type { Cases } from './useCases';
import { errorMessage } from '../utils/errorMessage';

type Payload = Record<string, unknown>;

interface CaseContext {
  cases: Pick<Cases, 'builder' | 'cases' | 'fitOf'>;
  routines: { checkLogic: (logic: unknown) => Promise<CompileResult> };
  setAction: (action: string) => void;
  runCase: (id: string) => void;
}

const VALUE_KEYS: Array<[string, ParamKey]> = [
  ['distance_mm', 'distanceMm'],
  ['height_mm', 'heightMm'],
  ['side_mm', 'sideMm'],
  ['radius_mm', 'radiusMm'],
  ['push_mm', 'pushMm'],
  ['box_mm', 'boxMm'],
  ['dots', 'dots'],
  ['stops', 'stops'],
  ['spacing_mm', 'spacingMm'],
  ['seconds', 'seconds'],
];

const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined);

export function caseValues(payload: Payload): Partial<GoalValues> {
  return Object.fromEntries(
    VALUE_KEYS.flatMap(([from, to]) => {
      const v = payload[from];

      return typeof v === 'number' && Number.isFinite(v) ? [[to, v]] : [];
    }),
  );
}

function extraObjects(payload: Payload): WorldObject[] | string {
  try {
    return sceneObjects(Array.isArray(payload.objects) ? (payload.objects as AgentObject[]) : []);
  } catch (e) {
    return errorMessage(e);
  }
}

async function logicProblem(spec: CaseSpec, ctx: CaseContext): Promise<string | null> {
  if (spec.logic === undefined) return null;

  const draft = ctx.cases.builder.preview(spec);

  if (!draft.ok) return draft.problem;

  const compiled = await ctx.routines.checkLogic(draft.kase.logic);

  return compiled.ok ? null : compiled.errors[0].message;
}

async function createCase(payload: Payload, ctx: CaseContext) {
  const objects = extraObjects(payload);

  if (typeof objects === 'string') return { ok: false, problem: objects };

  ctx.setAction('Making a Case');

  const spec: CaseSpec = {
    goal: String(payload.goal) as GoalKind,
    world: (text(payload.world) ?? 'floor') as WorldKind,
    values: caseValues(payload),
    name: text(payload.name),
    brief: text(payload.brief),
    objects,
    logic: payload.logic,
    score: payload.score,
    console: payload.console,
  };
  const refused = await logicProblem(spec, ctx);

  if (refused) return { ok: false, problem: refused };

  const built = ctx.cases.builder.add(spec);

  if (!built.ok) return built;

  const { id, name, brief, task, world } = built.kase;
  const reply = { ok: true, id, name, brief, seconds: task.seconds, objects: world.objects.length };

  if (!built.kase.console) return reply;

  ctx.runCase(id);

  return { ...reply, running: true };
}

async function checkCaseFit(payload: Payload, ctx: CaseContext) {
  const kase = ctx.cases.cases.find((c) => c.id === payload.id);

  if (!kase)
    return {
      ok: false,
      problem: `No Case ${String(payload.id)}. Cases: ${ctx.cases.cases.map((c) => c.id).join(', ')}`,
    };

  return { ok: true, rows: await ctx.cases.fitOf(kase) };
}

export const CASE_HANDLERS: Record<string, (payload: Payload, ctx: CaseContext) => Promise<unknown>> = {
  create_case: createCase,
  check_case_fit: checkCaseFit,
};
