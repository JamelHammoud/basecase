import type { MainModule } from '@mujoco/mujoco';
import { bodyAnalysisScenario, BODY_ANALYSIS_SCENARIOS } from './bodyAnalysisMatrix.fixtures';
import { analyzeBody } from './bodyAnalysis';
import { prepareBodySequence, advanceBodySequence, observeBodySequence } from './bodySequence';
import { bodyMotionPlans } from './bodyMotionPlans';
import { recommendBodyMotion } from './bodyMotion';
import { bodySequenceDisk } from './bodySequenceDisk.fixtures';
import { runBodySequenceEvidence } from '../workspace/bodySequenceAction';
import { validateBodySequence } from './bodySequenceValidation';
import { emptyBodyFit } from './bodyParameters';
import { replayBody, BodyReplayStopped, type BodyReplayBudget } from './bodyReplay';
import { sequenceInformation, sequenceColumns } from './bodySequenceInformation';
import { wasmHeapBytes } from './bodyAnalysisMetrics';
import { bodySequenceValidationPlan } from './bodySequenceValidationPlan';
import type { BodyAnalysisRequest } from './bodyAnalysisTypes';
import type { BodyFit } from './bodyTypes';
import type { BodySequence } from './bodySequenceTypes';
import { mkdirSync, writeFileSync } from 'node:fs';

type Strategy = 'accumulated' | 'fixed' | 'single';

interface ExperimentContext {
  request: BodyAnalysisRequest;
  sequence: BodySequence;
  mj: MainModule;
  strategy: Strategy;
}

async function comparatorPlan(context: ExperimentContext, budget: BodyReplayBudget) {
  const { request, sequence, mj, strategy } = context;

  if (strategy === 'fixed') return bodyMotionPlans(request)[sequence.rounds.length] ?? null;

  const latest = sequence.rounds.at(-1);
  const motion = await recommendBodyMotion(
    {
      request: { ...request, run: latest?.run ?? request.run },
      result: latest?.analysis ?? sequence.original,
      selected: sequence.selected,
    },
    { mj, stepBudget: budget.remainingSteps },
  );

  budget.remainingSteps -= motion.physicsSteps;

  if (motion.kind === 'refused') throw new BodyReplayStopped(motion.reason === 'cancelled' ? 'cancelled' : 'budget');

  return motion.kind === 'recommended' ? motion.plan : null;
}

async function advanceComparator(context: ExperimentContext): Promise<BodySequence> {
  const { request, mj } = context;
  const sequence = structuredClone(context.sequence);
  const budget = { remainingSteps: sequence.limits.physicsSteps - sequence.spent.physicsSteps };
  const before = budget.remainingSteps;

  if (sequence.reason) return sequence;

  try {
    const plan = await comparatorPlan(context, budget);

    if (!plan) {
      sequence.reason = 'no-improvement';

      return sequence;
    }

    const observed = observeBodySequence({
      request: { ...request, run: plan.run },
      mj,
      budget,
      fit: sequence.simulationFit,
    });
    const analysis = await analyzeBody({ ...request, run: observed.run }, { mj, budget });

    if (analysis.kind !== 'analyzed') throw new BodyReplayStopped('budget');

    const information = sequenceInformation(sequence, sequenceColumns(analysis));

    sequence.rounds.push({
      plan,
      ...observed,
      analysis,
      directions: information.score.directions,
      contribution: information.contribution,
      candidates: [],
      physicsSteps: before - budget.remainingSteps,
    });
    sequence.directions = information.score.directions;
    sequence.spent.seconds += plan.seconds;
    sequence.reason = sequence.spent.seconds + plan.seconds > sequence.limits.seconds ? 'duration' : null;

    if (sequence.rounds.length >= sequence.limits.rounds) sequence.reason = 'rounds';
  } catch (error) {
    if (!(error instanceof BodyReplayStopped)) throw error;

    sequence.reason = error.reason;
  } finally {
    sequence.spent.physicsSteps += before - budget.remainingSteps;
  }

  return sequence;
}

function plantedFit(request: BodyAnalysisRequest, name: string): BodyFit {
  if (name === 'unchanged control') return emptyBodyFit();

  const bodies = request.model.bodies.filter((entry) => entry.joint);
  const fit = emptyBodyFit();

  if (name.includes('rover')) return { ...fit, floorFrictionScale: 0.8 };

  if (name === 'terminal payload' || name === 'coupled wrist')
    return { ...fit, payloadKg: { [bodies.at(-1)!.name]: 0.1 } };

  fit.massScales[bodies[0].name] = 1.25;

  if (name === 'two-link masses' || name === 'asymmetric quadruped') fit.massScales[bodies.at(-1)!.name] = 0.8;

  return fit;
}

function validationDeclaration(request: BodyAnalysisRequest) {
  return bodySequenceValidationPlan(request)?.run ?? null;
}

async function preparedComparison(input: {
  request: Parameters<typeof prepareBodySequence>[0];
  truth: BodyFit;
  mj: MainModule;
}) {
  const { request, truth, mj } = input;
  const sequence = await prepareBodySequence(request, { mj, observationFit: truth });

  if (sequence.mujocoVersion) return sequence;

  const declaration = validationDeclaration(request.request);

  if (!declaration) return sequence;

  const budget = { remainingSteps: sequence.limits.physicsSteps };
  const validation = observeBodySequence({ request: { ...request.request, run: declaration }, mj, budget, fit: truth });

  return {
    ...sequence,
    validation: validation.run,
    validationInitialState: validation.initialState,
    mujocoVersion: mj.mj_version(),
    spent: { physicsSteps: sequence.limits.physicsSteps - budget.remainingSteps, seconds: 2 },
  };
}

function heldOutError(context: { request: BodyAnalysisRequest; sequence: BodySequence; mj: MainModule }) {
  const { request, sequence, mj } = context;
  const budget = { remainingSteps: sequence.limits.physicsSteps - sequence.spent.physicsSteps };
  const before = budget.remainingSteps;

  try {
    const prediction = replayBody(
      { ...request, mj, run: sequence.validation, budget },
      sequence.validationResult?.fit ?? request.nominal ?? emptyBodyFit(),
    );
    const errors = prediction.flatMap((row, frame) =>
      row.map((value, joint) => value - sequence.validation.statuses[frame].positions[joint]!),
    );

    return {
      rms: Math.sqrt(errors.reduce((sum, value) => sum + value * value, 0) / errors.length),
      physicsSteps: before - budget.remainingSteps,
    };
  } catch (error) {
    if (!(error instanceof BodyReplayStopped)) throw error;

    return { rms: null, physicsSteps: before - budget.remainingSteps };
  }
}

async function measureStrategy(input: {
  request: BodyAnalysisRequest;
  truth: BodyFit;
  mj: MainModule;
  strategy: Strategy;
}) {
  const { request, truth, mj, strategy } = input;
  const started = performance.now();
  const sampledBefore = process.memoryUsage();
  const analysisBudget = { remainingSteps: 1_000_000 };
  const result = await analyzeBody(request, { mj, budget: analysisBudget });

  if (result.kind !== 'analyzed') throw new Error(result.reason);

  const store = await bodySequenceDisk({ request, result, sourceKey: 'comparison', calibration: {} });
  const initialBytes = store.bytes();
  const preparationMs = performance.now() - started;
  let reference = store.source;

  try {
    const evidence = await runBodySequenceEvidence(
      {
        reference: store.source,
        selected: result.parameters.map((_, index) => index),
        current: () => true,
        signal: new AbortController().signal,
        retain: (next) => {
          reference = next;
        },
        worker: {
          prepareSequence: (input) => preparedComparison({ request: input, truth, mj }),
          advanceSequence: ({ request, sequence }) =>
            strategy === 'accumulated'
              ? advanceBodySequence(request, sequence, { mj })
              : advanceComparator({ request, sequence, mj, strategy }),
          dispose: () => {},
        },
      },
      store.ports,
    );

    if (!evidence) throw new Error('Comparison has no retained evidence');

    const validated = await validateBodySequence({ request, sequence: evidence.state }, { mj });
    const validation = heldOutError({ request, sequence: validated, mj });

    const saved = await store.ports.read(reference);

    if (!saved) throw new Error('Comparison evidence did not reopen');

    await store.ports.remember({ ...saved, sequence: { ...evidence, state: validated } });

    const sampledAfter = process.memoryUsage();
    const motionSeconds = validated.rounds.reduce((sum, round) => sum + round.plan.seconds, 0);

    return {
      strategy,
      limits: validated.limits,
      reason: validated.reason,
      validationRefusal: validated.validationRefusal,
      rounds: validated.rounds.length,
      unresolvedDirections: validated.directions.filter((direction) => !direction.distinguishable).length,
      plans: validated.rounds.map((round) => round.plan.id),
      motionSeconds,
      validationSeconds: 2,
      informationGainPerMotionSecond: motionSeconds
        ? validated.rounds.reduce((sum, round) => sum + round.contribution, 0) / motionSeconds
        : 0,
      heldOutRms: validation.rms,
      units: request.units,
      verdict: validated.validationResult?.verdict ?? 'cant-tell',
      physicsSteps: validated.spent.physicsSteps + validation.physicsSteps,
      preparationPhysicsSteps: 1_000_000 - analysisBudget.remainingSteps,
      preparationMs,
      completeMs: performance.now() - started,
      retainedBytes: store.bytes() - initialBytes,
      sampledMemoryBytes: Math.max(
        sampledBefore.heapUsed + sampledBefore.external,
        sampledAfter.heapUsed + sampledAfter.external,
      ),
      wasmCapacityBytes: wasmHeapBytes(mj),
    };
  } finally {
    store.close();
  }
}

export async function compareBodySequences(
  mj: MainModule,
  names: readonly (typeof BODY_ANALYSIS_SCENARIOS)[number][] = BODY_ANALYSIS_SCENARIOS,
  artifact = 'scratch/body-sequence-comparison.json',
  strategies: readonly Strategy[] = ['accumulated', 'fixed', 'single'],
) {
  const records = [];

  for (const name of names) {
    const { request } = await bodyAnalysisScenario(mj, name);
    const truth = plantedFit(request, name);
    const positions = replayBody({ ...request, mj }, truth);

    request.run = {
      ...request.run,
      statuses: request.run.statuses.map((status, frame) => ({ ...status, positions: positions[frame] })),
    };

    for (const strategy of strategies)
      records.push({ name, truth, ...(await measureStrategy({ request, truth, mj, strategy })) });
  }

  mkdirSync('scratch', { recursive: true });
  writeFileSync(
    artifact,
    JSON.stringify({ platform: process.platform, arch: process.arch, node: process.version, records }, null, 2),
  );

  return records;
}
