import { mkdirSync, writeFileSync } from 'node:fs';
import loadMujoco from '@mujoco/mujoco';
import { expect, it } from 'vitest';
import { bodyAnalysisScenario } from './bodyAnalysisMatrix.fixtures';
import { analyzeBody } from './bodyAnalysis';
import { parkedBodyRun } from './bodyMotion.fixtures';
import { recommendBodyMotion } from './bodyMotion';
import { benchOffset } from './benchSequence';
import { bodyMotionInformation } from './bodyMotionInformation';
import { replayBody } from './bodyReplay';
import { fitBody } from './fitBody';
import { recordedBodyRun } from './bodyFit.fixtures';
import { wasmHeapBytes } from './bodyAnalysisMetrics';
import type { RobotRun } from '../robot/runBuffer';
import { OperateRecorder } from '../../electron/robot/operateRecorder.mjs';

function recordingCost(run: RobotRun) {
  let at = 0;
  let text = '';
  const start = performance.now();
  const recorder = new OperateRecorder({
    spec: { family: 'feetech', ids: run.joints.map((_, index) => index + 1) },
    clock: () => at,
    radians: () => run.joints.map(() => 0),
    sink: {
      append: (_id, chunk) => {
        text += chunk;
      },
      keep: () => {},
      drop: () => {},
    },
  });

  recorder.setContext({ sceneId: 'measured-cost', robot: 'Arm', modelHash: 'a'.repeat(64), joints: run.joints });
  recorder.beginMotion(
    { recommendation: 'b'.repeat(64), sourceKey: 'c'.repeat(64) },
    '00000000-0000-0000-0000-000000000000',
    1,
  );

  for (const [index, intent] of run.intents.entries()) {
    at = intent.at;
    recorder.intent(intent.joints);
    recorder.event({ event: 'status', mode: 'test', run: 'running', frame: index });
  }

  recorder.endMotion('completed');

  return {
    elapsedMs: performance.now() - start,
    bytes: new TextEncoder().encode(text).byteLength,
    observations: run.intents.length,
  };
}

it('measures equal two-second selected and fixed bench prefixes with independent validation and separate recording costs', async () => {
  const mj = await loadMujoco();
  const { request } = await bodyAnalysisScenario(mj, 'two-link masses');
  const validation = recordedBodyRun(mj, request.model);

  request.run = parkedBodyRun(request.model);

  const result = await analyzeBody(request, { mj });

  if (result.kind !== 'analyzed') throw new Error(result.reason);

  const start = performance.now();
  const recommendation = await recommendBodyMotion({ request, result, selected: [0] }, { mj });
  const selectionMs = performance.now() - start;

  if (recommendation.kind !== 'recommended') throw new Error(recommendation.kind);

  const truth = { massScales: { [result.parameters[0].body]: 1.25 }, payloadKg: {}, floorFrictionScale: 1 };
  const observe = (run: RobotRun) => {
    const positions = replayBody({ ...request, mj, run }, truth);

    return { ...run, statuses: run.statuses.map((status, frame) => ({ ...status, positions: positions[frame] })) };
  };
  const heldOut = observe(validation);
  const fixed = {
    ...recommendation.plan.run,
    intents: recommendation.plan.run.intents.map((intent) => ({
      ...intent,
      joints: intent.joints.map(() => benchOffset(intent.at / 1000)),
    })),
  };
  const heapBefore = process.memoryUsage().heapUsed;
  const records = [];

  for (const [name, declaration] of [
    ['fixed', fixed],
    ['selected', recommendation.plan.run],
  ] as const) {
    const begun = performance.now();
    const observed = observe(declaration);
    const information = await analyzeBody({ ...request, run: observed }, { mj });

    if (information.kind !== 'analyzed') throw new Error(information.reason);

    const columns = information.parameters.map((_, parameter) =>
      Float64Array.from(
        information.directions,
        (direction) => direction.weights[parameter] * direction.response * Math.sqrt(information.directions.length),
      ),
    );
    const score = bodyMotionInformation({ original: result.directions, candidate: columns, selected: [0] });
    const fitted = await fitBody({ ...request, run: observed, validation: heldOut, mj });
    const predicted = replayBody({ ...request, mj, run: validation }, fitted.fit);
    const differences = predicted.flatMap((row, frame) =>
      row.map((value, joint) => value - heldOut.statuses[frame].positions[joint]!),
    );
    const rms = Math.sqrt(differences.reduce((sum, value) => sum + value * value, 0) / differences.length);

    records.push({
      name,
      executedSeconds: 2,
      validationSeconds: 3.6,
      informationGainPerSecond: score.gain / 2,
      validationRmsRad: rms,
      verdict: fitted.verdict,
      validationGain: fitted.evidence.gain,
      preparationAndFitMs: performance.now() - begun,
      selectionMs: name === 'selected' ? selectionMs : 0,
      recordingStorage: recordingCost(declaration),
    });
    expect(Number.isFinite(rms)).toBe(true);
    expect(declaration.intents.at(-1)!.at).toBe(2000);
    expect(fitted.verdict === 'cant-tell' || fitted.evidence.gain >= 0.25).toBe(true);
  }

  mkdirSync('scratch', { recursive: true });
  writeFileSync(
    'scratch/body-experiment-cost.json',
    JSON.stringify(
      {
        numericalEvidence: 'generated-wasm-body-trajectories',
        storageEvidence: 'controlled-zero-observations',
        records,
        sampledHeapBefore: heapBefore,
        sampledHeapAfter: process.memoryUsage().heapUsed,
        wasmCapacityBytes: wasmHeapBytes(mj),
      },
      null,
      2,
    ),
  );
});
