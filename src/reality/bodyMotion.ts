import type { MainModule } from '@mujoco/mujoco';
import { loadedMujoco } from './calibrate';
import { bodyAnalysisProblem } from './bodyAnalysisInput';
import { BODY_ANALYSIS_METHOD } from './bodyAnalysisTypes';
import { changedFit, physicalParameters } from './bodyAnalysisParameters';
import { replayBodies, BodyReplayStopped, type BodyReplayBudget } from './bodyReplay';
import { normalizedBodyResponse } from './bodySensitivity';
import { bodyMotionInformation } from './bodyMotionInformation';
import { bodyMotionPlans } from './bodyMotionPlans';
import { bodyMotionPreview, BodyPreviewStopped } from './bodyMotionPreview';
import { canonicalJson } from '../skills/hash';
import {
  BODY_MOTION_LIMITS as LIMITS,
  BODY_MOTION_METHOD as METHOD,
  type BodyMotionRequest,
  type BodyMotionOutcome,
  type BodyMotionPlan,
  type BodyMotionCandidate,
} from './bodyMotionTypes';

interface MotionOptions {
  mj?: MainModule;
  cancelled?: () => boolean;
  stepBudget?: number;
}

function matchingAnalysis({ request, result, selected }: BodyMotionRequest): boolean {
  const parameters = physicalParameters(request);

  return (
    result.kind === 'analyzed' &&
    result.robot === request.robot &&
    canonicalJson(result.method) === canonicalJson(BODY_ANALYSIS_METHOD) &&
    Object.entries(request.source).every(
      ([key, value]) => result.source[key as keyof typeof result.source] === value,
    ) &&
    selected.length <= parameters.length &&
    new Set(selected).size === selected.length &&
    selected.every((index) => Number.isInteger(index) && index >= 0 && index < parameters.length) &&
    result.parameters.length === parameters.length &&
    parameters.every((parameter, index) => {
      const saved = result.parameters[index];

      return Object.entries(parameter).every(
        ([key, value]) =>
          ['response', 'distinguishability'].includes(key) ||
          canonicalJson(saved[key as keyof typeof saved]) === canonicalJson(value),
      );
    })
  );
}

function libraryResponses(input: {
  input: BodyMotionRequest;
  plans: BodyMotionPlan[];
  mj: MainModule;
  budget: BodyReplayBudget;
}) {
  const { request, result } = input.input;
  const replayInput = {
    ...request,
    runs: input.plans.map((plan) => plan.run),
    model: { ...request.model, scans: undefined },
    mj: input.mj,
    budget: input.budget,
  };
  const normalized = (positions: number[][]) =>
    Float64Array.from(
      positions.flatMap((row) =>
        row.map(
          (value, index) => value / (request.units[index] === 'rad' ? result.method.noiseRad : result.method.noiseM),
        ),
      ),
    );
  const columns = input.plans.map(() => [] as Float64Array[]);

  for (const parameter of result.parameters) {
    const probe = (value: number) =>
      replayBodies(replayInput, changedFit({ request, parameter, value })).map(normalized);
    const low = probe(parameter.probe[0]);
    const high = probe(parameter.probe[1]);

    input.plans.forEach((_, index) =>
      columns[index].push(
        normalizedBodyResponse({
          low: low[index],
          high: high[index],
          span: parameter.probe[1] - parameter.probe[0],
          scale: parameter.scale,
        }),
      ),
    );
  }

  return { columns };
}

export async function recommendBodyMotion(
  input: BodyMotionRequest,
  options: MotionOptions = {},
): Promise<BodyMotionOutcome> {
  const total = stepLimit(options.stepBudget);
  const budget = { remainingSteps: total, cancelled: options.cancelled };
  const candidates: BodyMotionCandidate[] = [];
  const evidence = () => ({
    ...(input.speedRadS === undefined ? {} : { speedRadS: input.speedRadS }),
    method: METHOD,
    selected: Array.isArray(input?.selected) ? input.selected.slice(0, 24) : [],
    candidates,
    physicsSteps: total - budget.remainingSteps,
  });
  const refused = (reason: Extract<BodyMotionOutcome, { kind: 'refused' }>['reason']): BodyMotionOutcome => ({
    ...evidence(),
    kind: 'refused',
    reason,
  });

  if (options.cancelled?.()) return refused('cancelled');

  try {
    const problem = await bodyMotionProblem(input);

    if (problem) return refused(problem);

    if (!hasWeakTargets(input)) return { ...evidence(), kind: 'no-improvement' };

    const plans = bodyMotionPlans(input.request, input.speedRadS);

    if (!plans.length) return { ...evidence(), kind: 'no-improvement' };

    if (!searchFitsBudget(input, plans, total)) return refused('budget');

    const mj = options.mj ?? (await loadedMujoco());
    const best = searchPlans({ input, plans, mj, budget, candidates });

    if (options.cancelled?.()) return refused('cancelled');

    if (!best) return { ...evidence(), kind: 'no-improvement' };

    const preview = bodyMotionPreview({ input, plan: best.plan, mj, budget });

    return { ...best, ...evidence(), preview };
  } catch (error) {
    return refused(motionFailure(error, options.cancelled));
  }
}

function stepLimit(given: number = LIMITS.physicsSteps): number {
  return Number.isFinite(given) ? Math.max(0, Math.min(Math.floor(given), LIMITS.physicsSteps)) : 0;
}

function hasWeakTargets(input: BodyMotionRequest): boolean {
  return input.result.directions.some(
    (direction) =>
      !direction.distinguishable &&
      input.selected.some((index) => Math.abs(direction.weights[index]) >= BODY_ANALYSIS_METHOD.directionLoading),
  );
}

function searchFitsBudget(input: BodyMotionRequest, plans: BodyMotionPlan[], total: number): boolean {
  const dt = Number(/\btimestep="([^"]+)"/.exec(input.request.model.xml)?.[1] ?? 0.002);
  const estimate = plans.reduce(
    (sum, plan) => sum + Math.ceil(plan.seconds / dt) * (2 * input.result.parameters.length),
    0,
  );

  return Number.isFinite(total) && total > 0 && estimate + Math.ceil(LIMITS.seconds / dt) <= total;
}

function searchPlans(context: {
  input: BodyMotionRequest;
  plans: BodyMotionPlan[];
  mj: MainModule;
  budget: BodyReplayBudget;
  candidates: BodyMotionCandidate[];
}) {
  const { candidates } = context;
  let best: Omit<
    Extract<BodyMotionOutcome, { kind: 'recommended' }>,
    'method' | 'selected' | 'candidates' | 'physicsSteps' | 'preview'
  > | null = null;

  const ranked = rankBodyMotionCandidates(context);

  for (const { plan, score } of ranked) {
    candidates.push({ plan, score });

    if (!score.resolved || (best && score.after <= best.score.after)) continue;

    best = {
      kind: 'recommended',
      plan,
      score,
    };
  }

  return best;
}

export function rankBodyMotionCandidates(context: {
  input: BodyMotionRequest;
  plans: BodyMotionPlan[];
  mj: MainModule;
  budget: BodyReplayBudget;
}) {
  const { input, plans } = context;
  const responses = libraryResponses(context);

  return plans.map((plan, index) => ({
    plan,
    columns: responses.columns[index],
    score: bodyMotionInformation({
      original: input.result.directions,
      candidate: responses.columns[index],
      selected: input.selected,
    }),
  }));
}

export async function bodyMotionProblem(input: BodyMotionRequest) {
  if (!validMotionSpeed(input.speedRadS)) return 'unsupported' as const;

  const problem = await bodyAnalysisProblem(input.request);

  if (problem) return problem;

  return matchingAnalysis(input) ? null : 'provenance';
}

function validMotionSpeed(speed: number | undefined): boolean {
  return speed === undefined || (Number.isFinite(speed) && speed > 0 && speed <= LIMITS.speedRadS);
}

function motionFailure(error: unknown, cancelled?: () => boolean) {
  if (error instanceof BodyReplayStopped || error instanceof BodyPreviewStopped) return error.reason;

  return cancelled?.() ? 'cancelled' : 'numerical';
}
