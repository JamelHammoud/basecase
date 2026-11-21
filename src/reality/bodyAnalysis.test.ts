import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { sha256 } from '../cases/tries';
import { bodyFixture, recordedBodyRun } from './bodyFit.fixtures';
import { analyzeBody } from './bodyAnalysis';
import { bodyClient } from './bodyClient';
import { applyBodyFit } from './bodyModel';
import { replayBody } from './bodyReplay';
import type { RobotRun } from '../robot/runBuffer';
import type { BodyAnalysisRequest } from './bodyAnalysisTypes';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

async function fixture(): Promise<BodyAnalysisRequest> {
  const { model, robot } = bodyFixture();

  return {
    model,
    robot,
    run: shortRun(recordedBodyRun(mj, model)),
    units: model.joints.map(() => 'rad'),
    source: {
      recording: 'retained-arm',
      unit: 'arm-unit',
      scene: 'arm-scene',
      modelHash: await sha256(model.xml),
      modelFingerprint: model.robots[0].fingerprint,
      calibrationFingerprint: 'active-servo-calibration',
    },
  };
}

function shortRun(run: RobotRun): RobotRun {
  return { ...run, statuses: run.statuses.slice(0, 21), intents: run.intents.slice(0, 21) };
}

describe('read-only body analysis through production replay', () => {
  it('repeats an unchanged model without changing its model or observations', async () => {
    const request = await fixture();
    const before = structuredClone(request);
    const result = await analyzeBody(request, { mj });
    const repeated = await analyzeBody(request, { mj });

    expect(result.kind).toBe('analyzed');
    expect(repeated).toEqual(result);
    expect(request).toEqual(before);

    if (result.kind !== 'analyzed') throw new Error(result.reason);

    expect(result.residual.modelExplainsObservations).toBe(true);
    expect(result.method.version).toBe('body-sensitivity-1');
    expect(result.replays).toBe(1 + result.parameters.length * 2);
    expect(result.interval).toEqual([request.run.statuses[0].at, request.run.statuses.at(-1)!.at]);
    expect(result.source).toEqual(request.source);
    expect(
      result.parameters.every((parameter) => request.model.joints.some((joint) => joint.name === parameter.label)),
    ).toBe(true);
  });

  it('matches independently replayed bounded perturbations, including the one-sided payload bound', async () => {
    const request = await fixture();
    const result = await analyzeBody(request, { mj });

    if (result.kind !== 'analyzed') throw new Error(result.reason);

    for (const parameter of result.parameters) {
      const predictions = parameter.probe.map((value) => {
        const fit = { massScales: {}, payloadKg: {}, floorFrictionScale: 1 };

        if (parameter.kind === 'floorFrictionScale') fit.floorFrictionScale = value;
        else Object.assign(fit[parameter.kind], { [parameter.body]: value });

        return replayBody({ ...request, mj }, fit);
      });
      const normalized = predictions[1].flatMap((row, frame) =>
        row.map(
          (value, joint) =>
            ((value - predictions[0][frame][joint]) * parameter.scale) /
            ((parameter.probe[1] - parameter.probe[0]) * result.method.noiseRad),
        ),
      );
      const rms = Math.sqrt(normalized.reduce((sum, value) => sum + value * value, 0) / normalized.length);

      expect(normalized.every(Number.isFinite)).toBe(true);
      expect(parameter.probe[0]).toBeGreaterThanOrEqual(parameter.bounds[0]);
      expect(parameter.probe[1]).toBeLessThanOrEqual(parameter.bounds[1]);
      expect(parameter.response).toBeCloseTo(rms, 9);
    }
  });

  it('keeps mismatched observations unresolved without activating a fitted model', async () => {
    const request = await fixture();
    const changed = applyBodyFit(request.model, request.robot, {
      massScales: {},
      payloadKg: { [Object.keys(request.model.bodyPayloads!)[0]]: 0.3 },
      floorFrictionScale: 1,
    });
    const result = await analyzeBody({ ...request, run: shortRun(recordedBodyRun(mj, changed)) }, { mj });

    if (result.kind !== 'analyzed') throw new Error(result.reason);

    expect(result.residual.modelExplainsObservations).toBe(false);
    expect(result).not.toHaveProperty('fit');
    expect(result).not.toHaveProperty('confidence');
  });

  it('refuses provenance, telemetry, units, mapping and timing failures before replay', async () => {
    const request = await fixture();
    const variants: BodyAnalysisRequest[] = [
      { ...request, source: { ...request.source, modelHash: '0'.repeat(64) } },
      { ...request, source: { ...request.source, calibrationFingerprint: '' } },
      { ...request, source: { ...request.source, modelFingerprint: 'another-model' } },
      { ...request, units: request.units.map(() => 'm') },
      { ...request, run: { ...request.run, joints: ['unknown'] } },
      { ...request, run: { ...request.run, intents: [] } },
      { ...request, run: { ...request.run, statuses: request.run.statuses.map((s) => ({ ...s, at: 0 })) } },
      { ...request, run: { ...request.run, statuses: request.run.statuses.map((s) => ({ ...s, positions: [null] })) } },
    ];

    for (const variant of variants) {
      const result = await analyzeBody(variant, { mj });

      expect(result.kind).toBe('refused');
      expect(result.replays).toBe(0);
    }
  });
});

describe('body analysis limits and delivery', () => {
  it('keeps noisy unchanged observations inside the declared noise assumption', async () => {
    const request = await fixture();
    const run = {
      ...request.run,
      statuses: request.run.statuses.map((status, frame) => ({
        ...status,
        positions: status.positions.map((value, joint) => value! + 0.0005 * Math.sin(frame * 7 + joint)),
      })),
    };
    const result = await analyzeBody({ ...request, run }, { mj });

    if (result.kind !== 'analyzed') throw new Error(result.reason);

    expect(result.residual.modelExplainsObservations).toBe(true);
    expect(result.residual.rmsNoise).toBeLessThan(result.method.absoluteResponse);
  });

  it('refuses sample, duration and parameter budgets without replay', async () => {
    const request = await fixture();
    const variants = [
      { ...request, run: { ...request.run, statuses: Array.from({ length: 4097 }, () => request.run.statuses[0]) } },
      {
        ...request,
        run: { ...request.run, statuses: request.run.statuses.map((status) => ({ ...status, at: status.at * 100 })) },
      },
      {
        ...request,
        model: {
          ...request.model,
          bodies: Array.from({ length: 25 }, () => request.model.bodies.find((body) => body.joint)!),
        },
      },
    ];

    for (const variant of variants) {
      expect(await analyzeBody(variant, { mj })).toMatchObject({ kind: 'refused', reason: 'budget', replays: 0 });
    }
  });

  it('stops during a replay when cancelled and returns no partial analysis', async () => {
    const request = await fixture();
    let checks = 0;
    const result = await analyzeBody(request, { mj, cancelled: () => ++checks >= 5 });

    expect(result).toMatchObject({ kind: 'refused', reason: 'cancelled', replays: 1 });
    expect(result).not.toHaveProperty('parameters');
  });

  it('delivers the same result through the existing body client local production path', async () => {
    const request = await fixture();
    const client = bodyClient();

    try {
      expect(await client.analyze(request)).toEqual(await analyzeBody(request, { mj }));
    } finally {
      client.dispose();
    }
  });

  it('cancels before loading or replaying physics', async () => {
    const request = await fixture();
    const result = await analyzeBody(request, { cancelled: () => true });

    expect(result).toMatchObject({ kind: 'refused', reason: 'cancelled', replays: 0 });
  });
});

describe('analysis at the retained nominal body model', () => {
  it('replays active mass and payload values without adding a second payload geometry', async () => {
    const request = await fixture();
    const { forearm, wrist } = bodyFixture();
    const nominal = { massScales: { [forearm]: 1.3 }, payloadKg: { [wrist]: 0.15 }, floorFrictionScale: 1 };
    const effective = applyBodyFit(request.model, request.robot, nominal);
    const result = await analyzeBody(
      {
        ...request,
        nominal,
        run: shortRun(recordedBodyRun(mj, effective)),
        source: {
          ...request.source,
          modelHash: await sha256(effective.xml),
          modelFingerprint: effective.robots[0].fingerprint,
        },
      },
      { mj },
    );

    if (result.kind !== 'analyzed') throw new Error(result.reason);

    expect(result.residual.modelExplainsObservations).toBe(true);
    expect(result.parameters.find((parameter) => parameter.kind === 'payloadKg')?.nominal).toBeCloseTo(0.15, 12);
    expect(
      result.parameters.find((parameter) => parameter.kind === 'massScales' && parameter.body === forearm)?.nominal,
    ).toBeCloseTo(1.3, 12);
  });
});

describe('retained command-aligned body intervals', () => {
  it('uses the fitter window after idle telemetry without hiding corrupted earlier timestamps', async () => {
    const request = await fixture();
    const shifted = {
      ...request.run,
      statuses: [
        ...[0, 100, 200].map((at) => ({ at, positions: request.run.statuses[0].positions })),
        ...request.run.statuses.map((status) => ({ ...status, at: status.at + 1000 })),
      ],
      intents: request.run.intents.map((intent) => ({ ...intent, at: intent.at + 1000 })),
    };
    const result = await analyzeBody({ ...request, run: shifted }, { mj });

    if (result.kind !== 'analyzed') throw new Error(result.reason);

    expect(result.interval).toEqual([1000, 2200]);
    expect(result.residual.modelExplainsObservations).toBe(true);
    shifted.statuses[0] = { ...shifted.statuses[0], at: -1 };
    expect(await analyzeBody({ ...request, run: shifted }, { mj })).toMatchObject({ kind: 'refused', replays: 0 });
  });

  it('retains commands after the final observation without treating them as observed motion', async () => {
    const request = await fixture();
    const run = {
      ...request.run,
      intents: [
        ...request.run.intents,
        { at: request.run.statuses.at(-1)!.at + 100, joints: request.run.joints.map(() => 1) },
      ],
    };

    expect(await analyzeBody({ ...request, run }, { mj })).toEqual(await analyzeBody(request, { mj }));
  });

  it('refuses unsupported body parameters before replay', async () => {
    const request = await fixture();
    const nominal = { massScales: { unsupportedBody: 1.1 }, payloadKg: {}, floorFrictionScale: 1 };

    expect(
      await analyzeBody({ ...request, nominal: { ...nominal, massScales: {}, floorFrictionScale: 5 } }, { mj }),
    ).toMatchObject({ kind: 'refused', reason: 'unsupported', replays: 0 });

    expect(await analyzeBody({ ...request, nominal }, { mj })).toMatchObject({
      kind: 'refused',
      reason: 'unsupported',
      replays: 0,
    });
  });
});
