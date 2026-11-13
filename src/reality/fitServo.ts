import type { MainModule } from '@mujoco/mujoco';
import type { ServoFit } from '../data/components';
import { buildMjcf } from '../sim/mjcf';
import { BENCH_JOINT, benchInput } from './bench';
import { levenbergMarquardt } from './leastSquares';
import { replayLog, rmsError } from './replay';
import { scaleBounds, scaledFit, scalesOf, type ServoParam, type ServoScales } from './servoParams';
import type { ServoLog, ServoPart } from './types';

export interface FitContext {
  mj: MainModule;
  servo: ServoPart;
  preset: { fit: ServoFit; volts: number };
}

const PRIOR_RAD = 0.002;

export function predictLog(ctx: FitContext, fit: ServoFit | null, log: ServoLog): Float64Array {
  const input = benchInput(ctx.servo, log.payload);
  const model = buildMjcf(fit ? { ...input, servoFits: { [BENCH_JOINT]: { fit, volts: ctx.preset.volts } } } : input);

  return replayLog(ctx.mj, model, log, BENCH_JOINT);
}

export type Segment = 'fit' | 'check' | 'all';

export const SETTLE_S = 0.3;

export function windowOf(log: ServoLog, segment: Segment): [number, number] {
  const n = log.positionRad.length;
  const settle = Math.min(n - 1, Math.round(SETTLE_S / log.dt));
  const half = Math.max(settle + 1, Math.floor(n / 2));

  if (segment === 'fit') return [settle, half];

  return segment === 'check' ? [half, n] : [settle, n];
}

function windowError(predicted: Float64Array, log: ServoLog, [from, to]: [number, number]): number {
  let sum = 0;

  for (let i = from; i < to; i++) sum += (predicted[i] - log.positionRad[i]) ** 2;

  return Math.sqrt(sum / Math.max(to - from, 1));
}

export function segmentErrors(ctx: FitContext, fit: ServoFit | null, logs: ServoLog[], segment: Segment): number[] {
  return logs.map((log) => windowError(predictLog(ctx, fit, log), log, windowOf(log, segment)));
}

export function wholeLogErrors(ctx: FitContext, fit: ServoFit | null, logs: ServoLog[]): number[] {
  return logs.map((log) => rmsError(predictLog(ctx, fit, log), log.positionRad));
}

interface ResidualSpec {
  names: readonly ServoParam[];
  logs: ServoLog[];
  segment: Segment;
}

function residualFor(ctx: FitContext, { names, logs, segment }: ResidualSpec) {
  const windows = logs.map((log) => windowOf(log, segment));
  const samples = windows.reduce((s, [from, to]) => s + to - from, 0);
  const prior = Math.sqrt(samples) * PRIOR_RAD;

  return (x: number[]) => {
    const fit = scaledFit(ctx.preset.fit, scalesOf(names, x));
    const out = new Float64Array(samples + names.length);
    let at = 0;

    logs.forEach((log, k) => {
      const predicted = predictLog(ctx, fit, log);
      const [from, to] = windows[k];

      for (let i = from; i < to; i++) out[at++] = predicted[i] - log.positionRad[i];
    });
    x.forEach((v, i) => (out[samples + i] = v * prior));

    return out;
  };
}

export interface RungFit {
  scales: ServoScales;
  fit: ServoFit;
}

export interface FitRequest {
  names: readonly ServoParam[];
  logs: ServoLog[];
  segment: Segment;
  start?: ServoScales;
}

const DELAY_GRID = [0.5, 1, 1.5, 2, 3, 4, 6].map(Math.log);

function startingPoint(request: FitRequest, residual: (x: number[]) => Float64Array): number[] {
  const x0 = request.names.map((n) => request.start?.[n] ?? 0);
  const at = request.names.indexOf('delay');

  if (at < 0) return x0;

  const cost = (x: number[]) => residual(x).reduce((s, v) => s + v * v, 0);
  const candidates = [x0, ...DELAY_GRID.map((d) => x0.map((v, i) => (i === at ? d : v)))];

  return candidates.map((x) => ({ x, c: cost(x) })).reduce((a, b) => (b.c < a.c ? b : a)).x;
}

export function fitScales(ctx: FitContext, request: FitRequest): RungFit {
  const { names } = request;
  const residual = residualFor(ctx, { names, logs: request.logs, segment: request.segment });
  const result = levenbergMarquardt({
    residual,
    x0: startingPoint(request, residual),
    lower: names.map((n) => scaleBounds(n)[0]),
    upper: names.map((n) => scaleBounds(n)[1]),
    maxIterations: 12,
  });
  const scales = scalesOf(names, result.x);

  return { scales, fit: scaledFit(ctx.preset.fit, scales) };
}
