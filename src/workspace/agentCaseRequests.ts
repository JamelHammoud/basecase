import { sceneObjects, type AgentObject } from '../agent/agentDrive';
import type { CaseSpec } from '../cases/caseBuilder';
import type { GoalKind, GoalValues, ParamKey } from '../cases/caseGoals';
import type { WorldKind } from '../cases/caseWorlds';
import type { WorldObject } from '../cases/schema';
import type { CompileResult } from '../routines/compile';
import { comparable, type Comparison } from '../cases/caseCompare';
import { designLabel, designServos, EXPLORE_RUNS, sameDesign } from '../cases/explore';
import { sortRows } from '../cases/exploreSort';
import type { Case } from '../cases/schema';
import { caseNamed, runCase, type RunCaseContext } from './agentCaseRun';
import type { Cases } from './useCases';
import type { CaseCompare } from './useCaseCompare';
import type { CaseExplore, Exploration } from './useCaseExplore';
import type { CaseRun } from './useCaseRun';
import { errorMessage } from '../utils/errorMessage';

type Payload = Record<string, unknown>;

interface CaseContext extends RunCaseContext {
  cases: Cases;
  caseCompare: Pick<CaseCompare, 'choicesFor' | 'compareNow' | 'start'>;
  caseExplore: Pick<CaseExplore, 'explore'>;
  caseRun: Pick<CaseRun, 'enterCase'>;
  routines: { checkLogic: (logic: unknown) => Promise<CompileResult> };
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
  ['rise_mm', 'riseMm'],
  ['incline_deg', 'inclineDeg'],
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

  ctx.caseRun.enterCase(id);

  return { ...reply, running: true };
}

function caseToCompare(payload: Payload, cases: Cases): Case | string {
  const wanted = text(payload.case);
  const kase = wanted ? caseNamed(cases.cases, wanted) : cases.active;

  if (!kase) return wanted ? `This scene has no Case named ${wanted}.` : 'No Case is open. Name one with case.';

  return comparable(kase) ? kase : `${kase.name} has more than one robot slot, so it can’t compare two robots.`;
}

function comparisonReply(kase: Case, comparison: Comparison) {
  const sceneOf = (tabId: string | null) => comparison.robots.find((r) => r.tabId === tabId)?.name ?? null;

  return {
    ok: true,
    case: kase.name,
    robots: comparison.robots.map(({ name, runs, costUsd, massG }) => ({
      scene: name,
      passes: runs.passes,
      runs: runs.runs,
      median_margin: Number(runs.medianMargin.toFixed(3)),
      cost_usd: costUsd,
      mass_g: Math.round(massG),
      ...(runs.refusal ? { refusal: runs.refusal } : {}),
    })),
    better: sceneOf(comparison.better),
  };
}

async function compareCaseRequest(payload: Payload, ctx: CaseContext) {
  const kase = caseToCompare(payload, ctx.cases);

  if (typeof kase === 'string') return { ok: false, problem: kase };

  const choices = ctx.caseCompare.choicesFor(kase);
  const scene = text(payload.scene);
  const choice = scene ? choices.find((c) => c.name.toLowerCase() === scene.toLowerCase()) : choices[0];
  const scenes = choices.map((c) => c.name);

  if (!choice && !choices.length)
    return { ok: false, problem: `No other open scene tab has a robot that fits ${kase.name}.`, scenes };

  if (!choice) return { ok: false, problem: `No open scene tab named ${scene} has a robot that fits.`, scenes };

  if (ctx.cases.active?.id === kase.id) ctx.caseCompare.start(choice.tabId);

  return comparisonReply(kase, await ctx.caseCompare.compareNow(kase, choice.tabId));
}

const round = (v: number, places: number) => Number(v.toFixed(places));

function exploreReply(kase: Case, { space, rows }: Exploration) {
  return {
    ok: true,
    case: kase.name,
    runs: EXPLORE_RUNS,
    current: { servos: designServos(space, space.current), volts: space.current.volts },
    designs: sortRows(rows, { key: 'passes', descending: true }).map(({ design, runs, changes, costUsd, massG }) => ({
      servos: sameDesign(design, space.current) ? 'current design' : designLabel(space, design),
      volts: design.volts,
      passes: runs.passes,
      worst_margin: round(runs.worstMargin, 3),
      cost_usd: round(costUsd, 2),
      mass_g: Math.round(massG),
      changes: changes.map(({ joints, mpn }) => ({ joints, mpn })),
      ...(sameDesign(design, space.current) ? { current: true } : {}),
      ...(runs.refusal ? { refusal: runs.refusal } : {}),
    })),
  };
}

async function exploreCaseRequest(payload: Payload, ctx: CaseContext) {
  const wanted = text(payload.case);
  const kase = wanted ? caseNamed(ctx.cases.cases, wanted) : ctx.cases.active;

  if (!kase)
    return {
      ok: false,
      problem: wanted ? `This scene has no Case named ${wanted}.` : 'No Case is open. Name one with case.',
    };

  ctx.setAction('Exploring servos');

  const explored = await ctx.caseExplore.explore(kase);

  return typeof explored === 'string' ? { ok: false, problem: explored } : exploreReply(kase, explored);
}

export const CASE_HANDLERS: Record<string, (payload: Payload, ctx: CaseContext) => Promise<unknown>> = {
  create_case: createCase,
  run_case: runCase,
  compare_case: compareCaseRequest,
  explore_case: exploreCaseRequest,
};
