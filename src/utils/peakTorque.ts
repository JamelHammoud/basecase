import type { ActuatorSpec } from '../data/components';
import { ratingAt } from './actuatorRules';
import type { ServoCurve } from './engineeringTypes';
import { ampsAt, type AmpModel } from './servoAmps';

export const PEAK_WINDOW_S = 0.025;
export const PEAK_LIMITS = { pass: 0.8, warn: 1, overS: 0.05, outside: 0.05 };
export const RPM_PER_RAD_S = 60 / (2 * Math.PI);

export interface TorqueSeries {
  windowS: number;
  absDemand: number[][];
  sqForce: number[][];
  amps?: number[][];
  demand?: number[][];
  speed?: number[][];
}

export interface RecorderOptions {
  windowS?: number;
  amps?: Array<AmpModel | null>;
}

export interface PeakSpan {
  settleS: number;
  heatFromS: number;
  heatToS: number;
}

export interface JointPeak {
  p99Nm: number;
  rmsNm: number;
  overS: number;
}

export type PeakStatus = 'pass' | 'warn' | 'fail';

export class TorqueRecorder {
  private readonly perWindow: number;
  private readonly abs: Float64Array;
  private readonly sq: Float64Array;
  private readonly current: Float64Array;
  private readonly signed: Float64Array;
  private readonly turning: Float64Array;
  private readonly models: Array<AmpModel | null>;
  private steps = 0;
  private readonly windowS: number;
  readonly absDemand: number[][];
  readonly sqForce: number[][];
  readonly amps: number[][];
  readonly demand: number[][];
  readonly speed: number[][];

  constructor(joints: number, dt: number, { windowS = PEAK_WINDOW_S, amps = [] }: RecorderOptions = {}) {
    this.perWindow = Math.max(1, Math.round(windowS / dt));
    this.windowS = this.perWindow * dt;
    this.abs = new Float64Array(joints);
    this.sq = new Float64Array(joints);
    this.current = new Float64Array(joints);
    this.signed = new Float64Array(joints);
    this.turning = new Float64Array(joints);
    this.models = Array.from({ length: joints }, (_, i) => amps[i] ?? null);
    this.absDemand = Array.from({ length: joints }, () => []);
    this.sqForce = Array.from({ length: joints }, () => []);
    this.amps = Array.from({ length: joints }, () => []);
    this.demand = Array.from({ length: joints }, () => []);
    this.speed = Array.from({ length: joints }, () => []);
  }

  add(demand: ArrayLike<number>, force: ArrayLike<number>, speed?: ArrayLike<number>) {
    for (let i = 0; i < this.abs.length; i++) {
      const model = this.models[i];

      this.abs[i] += Math.abs(demand[i]);
      this.signed[i] += demand[i];
      this.turning[i] += speed ? speed[i] : Number.NaN;
      this.sq[i] += force[i] * force[i];
      this.current[i] += model ? ampsAt(model, force[i]) : 0;
    }

    this.steps++;

    if (this.steps % this.perWindow === 0) this.flush();
  }

  private flush() {
    for (let i = 0; i < this.abs.length; i++) {
      this.absDemand[i].push(this.abs[i] / this.perWindow);
      this.sqForce[i].push(this.sq[i] / this.perWindow);

      if (this.models[i]) this.amps[i].push(this.current[i] / this.perWindow);

      this.demand[i].push(this.signed[i] / this.perWindow);
      this.speed[i].push(this.turning[i] / this.perWindow);
    }

    this.abs.fill(0);
    this.signed.fill(0);
    this.turning.fill(0);
    this.sq.fill(0);
    this.current.fill(0);
  }

  series(): TorqueSeries {
    return {
      windowS: this.windowS,
      absDemand: this.absDemand,
      sqForce: this.sqForce,
      amps: this.amps,
      demand: this.demand,
      speed: this.speed,
    };
  }
}

export function percentile(values: number[], q: number): number {
  if (!values.length) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));

  return sorted[rank];
}

function longestRun(values: number[], above: number): number {
  let best = 0;
  let run = 0;

  for (const v of values) {
    run = v > above ? run + 1 : 0;
    best = Math.max(best, run);
  }

  return best;
}

const mean = (values: number[]) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0);

export function jointPeak(series: TorqueSeries, index: number, stallNm: number, span: PeakSpan): JointPeak {
  const w = series.windowS;
  const demand = series.absDemand[index].slice(Math.ceil(span.settleS / w));
  const heat = series.sqForce[index].slice(Math.floor(span.heatFromS / w), Math.floor(span.heatToS / w));

  return {
    p99Nm: percentile(demand, 0.99),
    rmsNm: Math.sqrt(mean(heat)),
    overS: longestRun(demand, stallNm) * w,
  };
}

export function peakStatus(p: JointPeak, stallNm: number): PeakStatus {
  if (p.overS > PEAK_LIMITS.overS) return 'fail';

  return p.p99Nm <= PEAK_LIMITS.pass * stallNm ? 'pass' : 'warn';
}

const round = (v: number, step: number) => Math.round(v / step) * step;

export function jointSamples(series: TorqueSeries, index: number, settleS: number): Array<[number, number]> {
  const from = Math.ceil(settleS / series.windowS);
  const torque = series.demand?.[index].slice(from) ?? [];
  const speed = series.speed?.[index].slice(from) ?? [];

  return torque.flatMap((nm, i): Array<[number, number]> =>
    Number.isFinite(speed[i]) ? [[round(speed[i] * RPM_PER_RAD_S, 0.1), round(nm, 0.001)]] : [],
  );
}

export function servoCurve(act: ActuatorSpec, volts?: number, servos = 1): ServoCurve | undefined {
  const r = ratingAt(act, volts);

  return r.rpm ? { stallNm: r.stallNm * servos, ratedNm: r.ratedNm * servos, rpm: r.rpm } : undefined;
}

export const curveTorque = (curve: ServoCurve, rpm: number) =>
  curve.stallNm * Math.max(0, 1 - Math.abs(rpm) / curve.rpm);

export const isMotoring = ([rpm, nm]: [number, number]) => rpm * nm > 0;

export function outsideEnvelope(samples: Array<[number, number]>, curve: ServoCurve): number {
  if (!samples.length) return 0;

  const outside = samples.filter((s) => isMotoring(s) && Math.abs(s[1]) > curveTorque(curve, s[0]));

  return outside.length / samples.length;
}
