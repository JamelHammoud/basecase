import { type MainModule } from '@mujoco/mujoco';
import { loadMujoco } from '../sim/loadMujoco';
import { fitScales, segmentErrors, wholeLogErrors, windowOf, type FitContext } from './fitServo';
import { climbLadder, combinedError, RUNGS, type RungResult } from './ladder';
import { spread } from './replay';
import { presetServo } from './servoEstimate';
import { multipliers } from './servoParams';
import { servoPartOf } from './servoPart';
import type {
  CalibrationEvidence,
  CalibrationVerdict,
  FamilyName,
  ServoCalibration,
  ServoLog,
  ServoPart,
} from './types';
import { conditionsOf, ENCODER_RAD, EVIDENCE, explainedShare, preflight } from './verdict';
import { percent } from '../../electron/percent.mjs';

let mujoco: Promise<MainModule> | null = null;

export const loadedMujoco = () => (mujoco ??= loadMujoco());

export interface CalibrateRequest {
  servo: ServoPart;
  logs: ServoLog[];
  mj?: MainModule;
}

type FamilyLog = Omit<ServoLog, 'servo'> & { family: FamilyName };

export interface FamilyCalibrateRequest {
  family: FamilyName;
  logs: FamilyLog[];
  mj?: MainModule;
}

const asServoLog = (log: ServoLog | FamilyLog): ServoLog =>
  'servo' in log ? log : { ...log, servo: servoPartOf(log) };

function servoRequest(request: CalibrateRequest | FamilyCalibrateRequest): CalibrateRequest {
  if ('servo' in request) return request;

  return { servo: servoPartOf(request), logs: request.logs.map(asServoLog), mj: request.mj };
}

interface Outcome {
  verdict: CalibrationVerdict;
  reason: string;
  best?: RungResult;
  evidence?: Partial<CalibrationEvidence>;
}

function calibration(ctx: FitContext, logs: ServoLog[], outcome: Outcome): ServoCalibration {
  const { verdict, reason, best } = outcome;
  const measured = verdict === 'measured' && best;

  return {
    verdict,
    servo: ctx.servo,
    version: 0,
    rung: measured ? best.rung : 'preset',
    fit: measured ? best.fit : ctx.preset.fit,
    volts: ctx.preset.volts,
    scales: measured ? multipliers(best.scales) : {},
    conditions: conditionsOf(logs),
    evidence: {
      logs: logs.length,
      presetErrorRad: Number.NaN,
      fittedErrorRad: Number.NaN,
      gain: 0,
      explained: Number.NaN,
      ...outcome.evidence,
      reason,
    },
  };
}

function judge(ctx: FitContext, logs: ServoLog[]): Outcome {
  const problem = preflight(logs, ctx.servo);

  if (problem) return { verdict: 'cant-tell', reason: problem };

  const presetErrors = wholeLogErrors(ctx, null, logs);
  const presetExplained = explainedShare(
    presetErrors,
    logs.map((l) => spread(l.positionRad)),
  );
  const base = { logs: logs.length, presetErrorRad: combinedError(presetErrors), explained: presetExplained };

  if (presetErrors.every((e) => e < ENCODER_RAD))
    return { verdict: 'consistent', reason: 'The preset predicts every log within one encoder count', evidence: base };

  if (presetExplained < EVIDENCE.garbled)
    return { verdict: 'cant-tell', reason: 'The positions don’t follow the goals', evidence: base };

  return climb(ctx, logs, base);
}

const checkSpreads = (logs: ServoLog[]) =>
  logs.map((log) => {
    const [from, to] = windowOf(log, 'check');

    return spread(log.positionRad.slice(from, to));
  });

function climb(ctx: FitContext, logs: ServoLog[], base: Partial<CalibrationEvidence>): Outcome {
  const presetCheck = segmentErrors(ctx, null, logs, 'check');
  const best = climbLadder(ctx, logs, presetCheck);
  const presetExplained = explainedShare(presetCheck, checkSpreads(logs));

  if (!best) {
    const verdict = presetExplained >= EVIDENCE.explained ? 'consistent' : 'cant-tell';

    return { verdict, reason: 'No update predicts the check segments better', evidence: base };
  }

  const explained = explainedShare(best.checkErrors, checkSpreads(logs));
  const evidence = { ...base, fittedErrorRad: combinedError(best.checkErrors), gain: best.gain, explained };

  if (explained < EVIDENCE.explained)
    return { verdict: 'cant-tell', reason: 'Even the best update leaves most of the motion unexplained', evidence };

  const params = RUNGS.find((r) => r.name === best.rung)?.params ?? [];
  const final = fitScales(ctx, { names: params, logs, segment: 'all', start: best.scales });

  return {
    verdict: 'measured',
    reason: `Check segments predicted ${percent(best.gain)} better`,
    best: { ...best, ...final },
    evidence,
  };
}

export async function calibrateServo(asked: CalibrateRequest | FamilyCalibrateRequest): Promise<ServoCalibration> {
  const request = servoRequest(asked);
  const ctx: FitContext = {
    mj: request.mj ?? (await loadedMujoco()),
    servo: request.servo,
    preset: presetServo(request.servo),
  };

  return calibration(ctx, request.logs, judge(ctx, request.logs));
}

export { calibratedInput } from './calibratedInput';
