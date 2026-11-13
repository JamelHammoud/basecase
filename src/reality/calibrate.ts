import { type MainModule } from '@mujoco/mujoco';
import { loadMujoco } from '../sim/loadMujoco';
import { presetServo } from './bench';
import { fitScales, segmentErrors, wholeLogErrors, windowOf, type FitContext } from './fitServo';
import { climbLadder, combinedError, RUNGS, type RungResult } from './ladder';
import { spread } from './replay';
import { multipliers } from './servoParams';
import type { CalibrationEvidence, CalibrationVerdict, ServoCalibration, ServoFamily, ServoLog } from './types';
import { conditionsOf, ENCODER_RAD, EVIDENCE, explainedShare, preflight } from './verdict';

let mujoco: Promise<MainModule> | null = null;

const loadedMujoco = () => (mujoco ??= loadMujoco());

export interface CalibrateRequest {
  family: ServoFamily;
  logs: ServoLog[];
  mj?: MainModule;
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
    family: ctx.family,
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
  const problem = preflight(logs, ctx.family);

  if (problem) return { verdict: 'cant-tell', reason: problem };

  const presetErrors = wholeLogErrors(ctx, ctx.preset.fit, logs);
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
  const presetCheck = segmentErrors(ctx, ctx.preset.fit, logs, 'check');
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
    reason: `Check segments predicted ${(best.gain * 100).toFixed(0)}% better`,
    best: { ...best, ...final },
    evidence,
  };
}

export async function calibrateServo(request: CalibrateRequest): Promise<ServoCalibration> {
  const ctx: FitContext = {
    mj: request.mj ?? (await loadedMujoco()),
    family: request.family,
    preset: presetServo(request.family),
  };

  return calibration(ctx, request.logs, judge(ctx, request.logs));
}

export { calibratedInput } from './calibratedInput';
