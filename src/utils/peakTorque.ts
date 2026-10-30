export const PEAK_WINDOW_S = 0.025;
export const PEAK_LIMITS = { pass: 0.8, warn: 1, overS: 0.05 };

export interface TorqueSeries {
  windowS: number;
  absDemand: number[][];
  sqForce: number[][];
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
  private steps = 0;
  private readonly windowS: number;
  readonly absDemand: number[][];
  readonly sqForce: number[][];

  constructor(joints: number, dt: number, windowS = PEAK_WINDOW_S) {
    this.perWindow = Math.max(1, Math.round(windowS / dt));
    this.windowS = this.perWindow * dt;
    this.abs = new Float64Array(joints);
    this.sq = new Float64Array(joints);
    this.absDemand = Array.from({ length: joints }, () => []);
    this.sqForce = Array.from({ length: joints }, () => []);
  }

  add(demand: ArrayLike<number>, force: ArrayLike<number>) {
    for (let i = 0; i < this.abs.length; i++) {
      this.abs[i] += Math.abs(demand[i]);
      this.sq[i] += force[i] * force[i];
    }

    this.steps++;

    if (this.steps % this.perWindow === 0) this.flush();
  }

  private flush() {
    for (let i = 0; i < this.abs.length; i++) {
      this.absDemand[i].push(this.abs[i] / this.perWindow);
      this.sqForce[i].push(this.sq[i] / this.perWindow);
    }

    this.abs.fill(0);
    this.sq.fill(0);
  }

  series(): TorqueSeries {
    return { windowS: this.windowS, absDemand: this.absDemand, sqForce: this.sqForce };
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
