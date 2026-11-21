import type { MainModule } from '@mujoco/mujoco';
import { loadedMujoco } from './calibrate';
import { analyzeBody, bodyObservationsSupported } from './bodyAnalysis';
import { bodyMotionProblem, rankBodyMotionCandidates } from './bodyMotion';
import { bodyMotionPlans } from './bodyMotionPlans';
import { bodyInformationContributions, bodyMotionInformation } from './bodyMotionInformation';
import { bodySensitivity } from './bodySensitivity';
import { BODY_MOTION_METHOD } from './bodyMotionTypes';
import { replayBody, BodyReplayStopped, type BodyReplayBudget } from './bodyReplay';
import { emptyBodyFit } from './bodyParameters';
import { integrationState } from '../sim/integrationState';
import { canonicalJson, hashOf } from '../skills/hash';
import type { BodyAnalysisRequest } from './bodyAnalysisTypes';
import type { BodyFit } from './bodyTypes';
import { bodyTrajectoryKey } from './bodyRun';
import { bodySequenceValidationPlan } from './bodySequenceValidationPlan';
import {
  BODY_SEQUENCE_LIMITS,
  BODY_SEQUENCE_METHOD,
  type BodySequence,
  type BodySequenceRequest,
  type BodySequenceLimits,
} from './bodySequenceTypes';
import { sequenceInformation, sequenceResolved, sequenceColumns, informationColumns } from './bodySequenceInformation';

interface SequenceOptions {
  mj?: MainModule;
  cancelled?: () => boolean;
  observationFit?: BodyFit;
}

function validLimits(limits: BodySequenceLimits) {
  return Object.entries(BODY_SEQUENCE_LIMITS).every(([key, maximum]) => {
    const value = limits[key as keyof BodySequenceLimits];

    return Number.isInteger(value) && value > 0 && value <= maximum;
  });
}

export function observeBodySequence(context: {
  request: BodyAnalysisRequest;
  mj: MainModule;
  budget: BodyReplayBudget;
  fit?: BodyFit;
}) {
  const { request } = context;
  let initialState: number[] = [];
  const positions = replayBody(
    {
      ...request,
      ...context,
      onStart: (engine) => {
        initialState = Array.from(integrationState(context.mj, engine.model, engine.data));

        if (initialState.length > 4096) throw new BodyReplayStopped('budget');
      },
    },
    context.fit ?? request.nominal ?? emptyBodyFit(),
  );

  return {
    run: {
      ...request.run,
      statuses: request.run.statuses.map((status, frame) => ({ ...status, positions: positions[frame] })),
    },
    initialState,
  };
}

function initialBodySequence(input: BodySequenceRequest, options: SequenceOptions): BodySequence {
  const { request, result, selected, limits } = input;

  return {
    method: BODY_SEQUENCE_METHOD,
    source: hashOf(request),
    selected: [...selected],
    original: structuredClone(result),
    simulationFit: structuredClone(options.observationFit ?? request.nominal ?? emptyBodyFit()),
    limits: { ...limits },
    validation: structuredClone(request.run),
    validationInitialState: [],
    rounds: [],
    directions: structuredClone(result.directions),
    spent: { physicsSteps: 0, seconds: 0 },
    reason: null,
  };
}

export async function prepareBodySequence(
  input: BodySequenceRequest,
  options: SequenceOptions = {},
): Promise<BodySequence> {
  const { request, limits } = input;
  const sequence = initialBodySequence(input, options);

  if (options.cancelled?.()) return { ...sequence, reason: 'cancelled' };

  if (!validLimits(limits)) return { ...sequence, reason: 'budget' };

  if (!bodyObservationsSupported(request)) return { ...sequence, reason: 'backend' };

  const problem = await bodyMotionProblem(input);

  if (problem) return { ...sequence, reason: problem };

  if (new TextEncoder().encode(canonicalJson(sequence)).byteLength + 262_144 > limits.bytes)
    return { ...sequence, reason: 'storage' };

  if (sequenceResolved(sequence)) return { ...sequence, reason: 'resolved' };

  const plan = bodySequenceValidationPlan(request);

  if (!plan) return { ...sequence, reason: 'no-improvement' };

  const declaration = plan.run;
  const budget = { remainingSteps: limits.physicsSteps, cancelled: options.cancelled };

  if (plan.seconds > limits.seconds) return { ...sequence, reason: 'duration' };

  try {
    const mj = options.mj ?? (await loadedMujoco());

    const observed = observeBodySequence({
      request: { ...request, run: declaration },
      mj,
      budget,
      fit: sequence.simulationFit,
    });

    sequence.validation = observed.run;
    sequence.validationInitialState = observed.initialState;
    sequence.mujocoVersion = mj.mj_version();
    sequence.spent.seconds = plan.seconds;
  } catch (error) {
    sequence.reason = error instanceof BodyReplayStopped ? error.reason : 'numerical';
  }

  sequence.spent.physicsSteps = limits.physicsSteps - budget.remainingSteps;

  if (new TextEncoder().encode(canonicalJson(sequence)).byteLength > limits.bytes)
    return { ...sequence, reason: 'storage' };

  return sequence;
}

export function stopBodySequence(sequence: BodySequence): BodySequence {
  return sequence.reason ? sequence : { ...sequence, reason: 'cancelled' };
}

export async function advanceBodySequence(
  request: BodyAnalysisRequest,
  saved: BodySequence,
  options: SequenceOptions = {},
): Promise<BodySequence> {
  if (saved.reason) return saved;

  if (options.cancelled?.()) return stopBodySequence(saved);

  if (saved.source !== hashOf(request)) return { ...saved, reason: 'provenance' };

  const sequence = structuredClone(saved);
  const budget = {
    remainingSteps: sequence.limits.physicsSteps - sequence.spent.physicsSteps,
    cancelled: options.cancelled,
  };
  const before = budget.remainingSteps;

  try {
    const reason = sequenceLimit(sequence);

    if (reason) return { ...sequence, reason };

    const mj = options.mj ?? (await loadedMujoco());

    if (sequence.mujocoVersion !== mj.mj_version()) return { ...sequence, reason: 'provenance' };

    await nextRound({ request, sequence, mj, budget });
  } catch (error) {
    sequence.reason = error instanceof BodyReplayStopped ? error.reason : 'numerical';
  }

  sequence.spent.physicsSteps += before - budget.remainingSteps;

  if (new TextEncoder().encode(canonicalJson(sequence)).byteLength > sequence.limits.bytes)
    return { ...saved, spent: sequence.spent, reason: 'storage' };

  return sequence;
}

function sequenceLimit(sequence: BodySequence) {
  if (sequenceResolved(sequence)) return 'resolved';

  if (sequence.rounds.length >= sequence.limits.rounds) return 'rounds';

  if (sequence.spent.seconds + 2 > sequence.limits.seconds) return 'duration';

  if (new TextEncoder().encode(canonicalJson(sequence)).byteLength >= sequence.limits.bytes) return 'storage';

  return null;
}

function uniquePlans(request: BodyAnalysisRequest) {
  const seen = new Set<string>();

  return bodyMotionPlans(request).filter((plan) => {
    const key = bodyTrajectoryKey(plan.run);

    if (seen.has(key)) return false;

    seen.add(key);

    return true;
  });
}

async function nextRound(context: {
  request: BodyAnalysisRequest;
  sequence: BodySequence;
  mj: MainModule;
  budget: BodyReplayBudget;
}) {
  const { request, sequence, mj, budget } = context;
  const result = sequence.original;
  const before = budget.remainingSteps;
  const excluded = new Set(
    [request.run, sequence.validation, ...sequence.rounds.map((round) => round.run)].map(bodyTrajectoryKey),
  );
  const input = { request, result: { ...result, directions: sequence.directions }, selected: sequence.selected };

  sequence.library ??= rankBodyMotionCandidates({ input, plans: uniquePlans(request), mj, budget }).map(
    ({ plan, columns }) => ({ plan, directions: bodySensitivity(columns).directions }),
  );

  const ranked = sequence.library
    .filter(({ plan }) => !excluded.has(bodyTrajectoryKey(plan.run)))
    .map(({ plan, directions }) => {
      const columns = informationColumns(directions);

      return {
        plan,
        columns,
        score: bodyMotionInformation({
          original: sequence.directions,
          candidate: columns,
          selected: sequence.selected,
        }),
      };
    });

  sequence.candidates = ranked.map(({ plan, score }) => ({ plan, score }));

  const useful = ranked
    .map((candidate) => ({
      ...candidate,
      contribution: bodyInformationContributions(
        {
          original: sequence.directions,
          candidate: candidate.columns,
          selected: sequence.selected,
        },
        candidate.score,
      ).contribution,
    }))
    .filter((candidate) => candidate.contribution >= BODY_MOTION_METHOD.minimumGain);
  const best = useful.reduce<(typeof useful)[number] | null>(
    (chosen, candidate) => (!chosen || candidate.contribution > chosen.contribution ? candidate : chosen),
    null,
  );

  if (!best) {
    sequence.reason = 'no-improvement';

    return;
  }

  if (roundStorageBound(sequence, best.plan.run) > sequence.limits.bytes) {
    sequence.reason = 'storage';

    return;
  }

  const observed = observeBodySequence({
    ...context,
    request: { ...request, run: best.plan.run },
    fit: sequence.simulationFit,
  });
  const analysis = await analyzeBody({ ...request, run: observed.run }, { mj, budget });

  if (analysis.kind !== 'analyzed') {
    sequence.reason = analysis.reason;

    return;
  }

  const information = sequenceInformation(sequence, sequenceColumns(analysis));
  const round = {
    plan: best.plan,
    ...observed,
    analysis,
    contribution: information.contribution,
    candidates: ranked.map(({ plan, score }) => ({ plan, score })),
    directions: information.score.directions,
    physicsSteps: before - budget.remainingSteps,
  };
  const retained = { ...sequence, rounds: [...sequence.rounds, round] };

  if (new TextEncoder().encode(canonicalJson(retained)).byteLength > sequence.limits.bytes) {
    sequence.reason = 'storage';

    return;
  }

  sequence.rounds.push(round);
  sequence.directions = round.directions;
  sequence.spent.seconds += best.plan.seconds;
  sequence.reason = sequenceLimit(sequence);
}

function roundStorageBound(sequence: BodySequence, run: BodyAnalysisRequest['run']) {
  const encode = (value: unknown) => new TextEncoder().encode(canonicalJson(value)).byteLength;

  return encode(sequence) + encode(run) + encode(sequence.candidates) + encode(sequence.original) + 262_144;
}
