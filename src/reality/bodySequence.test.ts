import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, expect, it } from 'vitest';
import { analyzeBody } from './bodyAnalysis';
import { bodyAnalysisScenario, BODY_ANALYSIS_SCENARIOS } from './bodyAnalysisMatrix.fixtures';
import { parkedBodyRun, colocatedBodyScenario } from './bodyMotion.fixtures';
import { replayBody } from './bodyReplay';
import { emptyBodyFit } from './bodyParameters';
import { accumulatedBodyAnalysis } from './bodySequenceInformation';
import { prepareBodySequence, advanceBodySequence, stopBodySequence } from './bodySequence';
import { BODY_SEQUENCE_LIMITS } from './bodySequenceTypes';
import { canonicalJson } from '../skills/hash';
import { mkdirSync, writeFileSync } from 'node:fs';
import { sha256 } from '../cases/tries';
import { bodyTrajectoryKey } from './bodyRun';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

async function fixture(name: (typeof BODY_ANALYSIS_SCENARIOS)[number] = 'two-link masses', parked = true) {
  const { request } = await bodyAnalysisScenario(mj, name);

  if (parked) request.run = parkedBodyRun(request.model);

  const result = await analyzeBody(request, { mj });

  if (result.kind !== 'analyzed') throw new Error(result.reason);

  return {
    request,
    result,
    selected: result.parameters.flatMap((parameter, index) =>
      parameter.distinguishability === 'distinguishable' ? [] : [index],
    ),
    limits: BODY_SEQUENCE_LIMITS,
  };
}

it('declares a frozen independent trajectory, retains actual observations and regenerates deterministically', async () => {
  const input = await fixture();
  const original = canonicalJson(input);
  const declared = await prepareBodySequence(input, { mj });
  const before = canonicalJson(declared);
  const next = await advanceBodySequence(input.request, declared, { mj });

  expect(canonicalJson(input)).toBe(original);
  expect(canonicalJson(declared)).toBe(before);
  expect(next.rounds.length).toBeGreaterThan(0);
  expect(next.validation).toEqual(declared.validation);
  expect(next.rounds[0].run.statuses).not.toEqual(next.rounds[0].plan.run.statuses);
  expect(next.rounds[0].run.intents).toEqual(next.rounds[0].plan.run.intents);
  expect(next.rounds[0].run.intents).not.toEqual(next.validation.intents);
  expect(next.rounds[0].initialState.every(Number.isFinite)).toBe(true);
  expect(accumulatedBodyAnalysis(input.result, next.directions).parameters[0].distinguishability).toBe(
    'distinguishable',
  );
  expect(next.spent.physicsSteps).toBeGreaterThan(declared.spent.physicsSteps);
  expect(next.spent.physicsSteps).toBeLessThanOrEqual(input.limits.physicsSteps);
  expect(new Set(next.library?.map(({ plan }) => canonicalJson(plan.run.intents))).size).toBe(next.library?.length);
  expect(await advanceBodySequence(input.request, declared, { mj })).toEqual(next);
  expect(stopBodySequence(next).reason).toBe(next.reason ?? 'cancelled');
  expect(stopBodySequence(next).rounds).toEqual(next.rounds);
});

it('excludes held-out observations from selection and rejects changed source inputs before physics', async () => {
  const input = await fixture();
  const declared = await prepareBodySequence(input, { mj });
  const changed = structuredClone(declared);

  changed.validation.statuses.forEach((status) => {
    status.positions = status.positions.map((position) => position! + 0.5);
  });

  const original = await advanceBodySequence(input.request, declared, { mj });
  const heldOutChanged = await advanceBodySequence(input.request, changed, { mj });

  expect(heldOutChanged.rounds).toEqual(original.rounds);
  expect(heldOutChanged.directions).toEqual(original.directions);

  const stale = await advanceBodySequence(
    { ...input.request, source: { ...input.request.source, unit: 'other' } },
    declared,
    { mj },
  );

  expect(stale.reason).toBe('provenance');
  expect(stale.spent).toEqual(declared.spent);
});

it('freezes a different validation trajectory when the source is a prior held-out recording', async () => {
  const input = await fixture('horizontal arm');
  const first = await prepareBodySequence(input, { mj });
  const request = { ...input.request, run: first.validation };
  const result = await analyzeBody(request, { mj });

  if (result.kind !== 'analyzed') throw new Error(result.reason);

  const next = await prepareBodySequence({ ...input, request, result }, { mj });

  expect(next.validation.statuses.length).toBeGreaterThan(1);
  expect(bodyTrajectoryKey(next.validation)).not.toBe(bodyTrajectoryKey(request.run));
  expect(
    bodyTrajectoryKey({
      ...request.run,
      statuses: request.run.statuses.map((status) => ({ ...status, at: status.at + 1000 })),
      intents: request.run.intents.map((intent) => ({ ...intent, at: intent.at + 1000 })),
    }),
  ).toBe(bodyTrajectoryKey(request.run));
});

it('stops without another observation when exact co-located mass and payload remain structurally inseparable', async () => {
  const { request } = await colocatedBodyScenario(mj);
  const positions = replayBody({ ...request, mj }, emptyBodyFit());

  request.run = {
    ...request.run,
    statuses: request.run.statuses.map((status, frame) => ({ ...status, positions: positions[frame] })),
  };

  const result = await analyzeBody(request, { mj });

  if (result.kind !== 'analyzed') throw new Error(result.reason);

  const selected = result.parameters.flatMap((parameter, index) =>
    parameter.distinguishability === 'coupled' ? [index] : [],
  );
  const prepared = await prepareBodySequence({ request, result, selected, limits: BODY_SEQUENCE_LIMITS }, { mj });
  const stopped = await advanceBodySequence(request, prepared, { mj });

  expect(selected.length).toBeGreaterThan(0);
  expect(stopped.reason).toBe('no-improvement');
  expect(stopped.rounds).toHaveLength(0);
  expect(stopped.directions.some((direction) => !direction.distinguishable)).toBe(true);
});

it('preserves a nonzero observed start with reduced actuator limits and refuses missing observations', async () => {
  const { request } = await bodyAnalysisScenario(mj, 'horizontal arm');

  request.model.xml = request.model.xml.replaceAll(
    /forcerange="([^" ]+) ([^"]+)"/g,
    (_match, low, high) => `forcerange="${Number(low) * 0.7} ${Number(high) * 0.7}"`,
  );
  request.model.joints = request.model.joints.map((joint) => ({ ...joint, effort: joint.effort * 0.7 }));
  request.source.modelHash = await sha256(request.model.xml);
  request.run = parkedBodyRun(request.model);
  request.run.statuses.forEach((status) => {
    status.positions[0] = 0.17;
  });
  request.run.intents.forEach((intent) => {
    intent.joints[0] = 0.17;
  });

  const observed = replayBody({ ...request, mj }, emptyBodyFit());

  request.run.statuses = request.run.statuses.map((status, frame) => ({ ...status, positions: observed[frame] }));

  const result = await analyzeBody(request, { mj });

  if (result.kind !== 'analyzed') throw new Error(result.reason);

  const input = { request, result, selected: result.parameters.map((_, index) => index), limits: BODY_SEQUENCE_LIMITS };
  const prepared = await prepareBodySequence(input, { mj });
  const next = await advanceBodySequence(request, prepared, { mj });

  expect(next.rounds.length).toBeGreaterThan(0);
  expect(next.rounds[0].run.statuses[0].positions[0]).toBeCloseTo(0.17, 12);
  expect(next.rounds[0].initialState).not.toEqual([]);

  const missing = structuredClone(request);

  missing.run.statuses[1].positions[0] = null;

  const refused = await prepareBodySequence({ ...input, request: missing }, { mj });

  expect(refused.reason).toBe('recording');
  expect(refused.spent.physicsSteps).toBe(0);
});

it.each(BODY_ANALYSIS_SCENARIOS)('retains useful additional evidence or an evidenced stop for %s', async (name) => {
  const input = await fixture(name, false);
  let sequence = await prepareBodySequence(input, { mj });

  for (let index = 0; index < input.limits.rounds && sequence.reason === null; index++) {
    sequence = await advanceBodySequence(input.request, sequence, { mj });
  }

  expect(sequence.reason).not.toBeNull();
  expect(sequence.reason).not.toBe('numerical');
  expect(sequence.rounds.length).toBeLessThanOrEqual(input.limits.rounds);
  expect(sequence.spent.seconds).toBeLessThanOrEqual(input.limits.seconds);
  expect(sequence.spent.physicsSteps).toBeLessThanOrEqual(input.limits.physicsSteps);
  expect(new Set(sequence.rounds.map((round) => canonicalJson(round.plan.run.intents))).size).toBe(
    sequence.rounds.length,
  );
  expect(sequence.rounds.every((round) => round.contribution > 0)).toBe(true);

  if (name === 'coupled wrist') expect(sequence.directions.some((direction) => !direction.distinguishable)).toBe(true);

  mkdirSync('scratch', { recursive: true });
  writeFileSync(`scratch/body-sequence-${name.replaceAll(' ', '-')}.json`, JSON.stringify(sequence, null, 2));
});

it('spends no physics after cancellation or a declared budget stop and refuses servo-only observations', async () => {
  const input = await fixture();
  const declared = await prepareBodySequence(input, { mj });
  const cancelled = await advanceBodySequence(input.request, declared, { mj, cancelled: () => true });

  expect(cancelled.reason).toBe('cancelled');
  expect(cancelled.spent).toEqual(declared.spent);
  expect(await advanceBodySequence(input.request, cancelled, { mj })).toEqual(cancelled);

  const exhausted = await prepareBodySequence({ ...input, limits: { ...input.limits, physicsSteps: 1 } }, { mj });

  expect(exhausted.reason).toBe('budget');
  expect(exhausted.spent.physicsSteps).toBeLessThanOrEqual(1);

  const storage = await prepareBodySequence({ ...input, limits: { ...input.limits, bytes: 1 } }, { mj });
  const duration = await prepareBodySequence({ ...input, limits: { ...input.limits, seconds: 1 } }, { mj });

  expect(storage.reason).toBe('storage');
  expect(storage.spent.physicsSteps).toBe(0);
  expect(duration.reason).toBe('duration');
  expect(duration.spent.physicsSteps).toBe(0);
  expect(
    (
      await prepareBodySequence(
        { ...input, request: { ...input.request, observations: 'servo-independent-1' } },
        { mj },
      )
    ).reason,
  ).toBe('backend');
});

it('stops at the declared round cap and accounts for interrupted preparation physics', async () => {
  const input = await fixture('coupled wrist');
  const declared = await prepareBodySequence({ ...input, limits: { ...input.limits, rounds: 1 } }, { mj });
  const limited = await advanceBodySequence(input.request, declared, { mj });

  expect(limited.rounds).toHaveLength(1);
  expect(limited.reason).toBe('rounds');
  expect(await advanceBodySequence(input.request, limited, { mj })).toEqual(limited);

  let polls = 0;
  const interrupted = await prepareBodySequence(input, { mj, cancelled: () => ++polls > 10 });

  expect(interrupted.reason).toBe('cancelled');
  expect(interrupted.rounds).toEqual([]);
  expect(interrupted.spent.physicsSteps).toBeGreaterThan(0);
  expect(interrupted.spent.physicsSteps).toBeLessThan(input.limits.physicsSteps);
});
