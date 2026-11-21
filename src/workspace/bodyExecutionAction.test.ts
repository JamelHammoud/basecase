import loadMujoco from '@mujoco/mujoco';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { executeBodyEvidence, type BodyExecutionAction } from './bodyExecutionAction';
import { fixturePackageJob } from '../sim/fixtures/robotPackage';
import { sha256 } from '../cases/tries';
import type { BodyAnalysisRequest } from '../reality/bodyAnalysisTypes';
import { bodyExecutionScene, parkedBodyRun } from '../reality/bodyMotion.fixtures';
import { analyzeBody } from '../reality/bodyAnalysis';
import { recommendBodyMotion } from '../reality/bodyMotion';
import { readBodyEvidence, type BodyEvidenceRef, type BodyEvidenceSnapshot } from '../reality/bodyEvidence';
import { bodyRecordingUnchanged } from '../reality/bodyRecordingIdentity';
import { playBenchTrajectory } from '../robot/benchRun';
import { connectRobot, receiveRobotEvent, startRobotStore } from '../robot/robotStore';

vi.mock('../reality/bodyEvidence', () => ({ readBodyEvidence: vi.fn() }));
vi.mock('../reality/bodyRecordingIdentity', () => ({ bodyRecordingUnchanged: vi.fn() }));
vi.mock('../robot/benchRun', async (original) => ({
  ...(await original<typeof import('../robot/benchRun')>()),
  playBenchTrajectory: vi.fn(),
}));

const spec = { family: 'feetech' as const, ids: [1], class: 'arm' as const, emulated: true as const };
let snapshot: BodyEvidenceSnapshot;
let reference: BodyEvidenceRef;

beforeAll(async () => {
  const mj = await loadMujoco();
  const { model } = fixturePackageJob(bodyExecutionScene()).job;
  const request: BodyAnalysisRequest = {
    model,
    robot: model.robots[0].key,
    run: parkedBodyRun(model),
    units: model.joints.map(() => 'rad'),
    source: {
      unit: 'robot',
      scene: 'scene',
      recording: 'source',
      modelHash: await sha256(model.xml),
      modelFingerprint: model.robots[0].fingerprint,
      calibrationFingerprint: 'preset',
    },
  };

  const result = await analyzeBody(request, { mj });

  if (result.kind !== 'analyzed') throw new Error(result.reason);

  const motion = await recommendBodyMotion({ request, result, selected: [0], speedRadS: 0.5 }, { mj });

  if (motion.kind !== 'recommended') throw new Error(motion.kind);

  snapshot = { request, result, motion, sourceKey: 'b'.repeat(64), calibration: {} };
  reference = {
    content: 'c'.repeat(64),
    ...request.source,
    joints: request.run.joints,
    sourceKey: snapshot.sourceKey,
    analyzed: true,
  };
  startRobotStore({
    onRobotEvent: () => () => {},
    robotConnect: async (ask, unit) => {
      receiveRobotEvent({ event: 'link', unit, state: 'connected', spec: ask });

      return { ok: true };
    },
  });
});

function status(position: number | null = 2048) {
  receiveRobotEvent({
    event: 'status',
    unit: 'robot',
    mode: 'test',
    run: 'running',
    sealed: false,
    fault_latched: false,
    joints: spec.ids.map((id) => ({ id, position, torque_on: true, reply: 'ok' })),
  });
}

beforeEach(async () => {
  vi.mocked(readBodyEvidence).mockResolvedValue(structuredClone(snapshot));
  vi.mocked(bodyRecordingUnchanged).mockResolvedValue(true);
  vi.mocked(playBenchTrajectory).mockClear().mockResolvedValue({ kind: 'completed', run: snapshot.request.run });
  await connectRobot(spec, snapshot.request.run.joints, 'robot');
  status();
});

function action(): BodyExecutionAction {
  return {
    reference,
    signal: new AbortController().signal,
    current: () => true,
    prepare: async () => ({
      context: { snapshot, modelHash: reference.modelHash },
      spec,
      mounts: spec.ids.map(() => ({ zeroCounts: 2048, direction: 1 as const })),
    }),
  };
}

function changedPlan() {
  const saved = structuredClone(snapshot);

  if (saved.motion?.kind === 'recommended') saved.motion.plan.run.intents[0].joints[0] = 1;

  return saved;
}

it('executes only the exact retained absolute plan and preserves recommendation bindings', async () => {
  expect((await executeBodyEvidence(action()))?.kind).toBe('completed');
  expect(playBenchTrajectory).toHaveBeenCalledWith(
    expect.objectContaining({
      unit: reference.unit,
      joints: reference.joints,
      recording: { recommendation: reference.content, sourceKey: reference.sourceKey },
      points: snapshot.motion?.kind === 'recommended' ? snapshot.motion.plan.run.intents : [],
    }),
  );
});

it.each(['source', 'calibration', 'model', 'unit', 'start', 'telemetry', 'plan', 'cancelled'])(
  'refuses changed %s before command ownership',
  async (change) => {
    const input = action();

    if (change === 'source') input.current = () => false;

    if (change === 'unit') receiveRobotEvent({ event: 'hello', unit: 'robot', emulated: false });

    if (change === 'start') status(2200);

    if (change === 'telemetry') status(null);

    if (change === 'cancelled') vi.mocked(bodyRecordingUnchanged).mockResolvedValue(false);

    if (change === 'plan') vi.mocked(readBodyEvidence).mockResolvedValue(changedPlan());

    if (change === 'model' || change === 'calibration')
      input.prepare = async () => ({
        spec,
        mounts: spec.ids.map(() => ({ zeroCounts: 2048, direction: 1 as const })),
        context: {
          modelHash: reference.modelHash,
          snapshot: {
            ...snapshot,
            request: {
              ...snapshot.request,
              source: {
                ...snapshot.request.source,
                [change === 'model' ? 'modelHash' : 'calibrationFingerprint']: 'd'.repeat(64),
              },
            },
          },
        },
      });

    await executeBodyEvidence(input).catch(() => null);
    expect(playBenchTrajectory).not.toHaveBeenCalled();
  },
);
