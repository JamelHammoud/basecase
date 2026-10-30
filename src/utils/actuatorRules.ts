import type { ActuatorPoint, ActuatorSpec } from '../data/components';

export const STANCE_LIMITS = { pass: 0.4, warn: 0.6 };
export const HEAT_LIMITS = { pass: 1, warn: 1.6 };
export const HOLD_LIMITS = { pass: 0.4, warn: 0.6 };
export const RMS_OF_STANCE = 0.67;
export const RATED_OF_STALL = 0.25;
export const PEAK_DERATE = 0.7;
export const MIN_CROUCH_DEG = 30;

export type LoadStatus = 'pass' | 'warn' | 'fail';

export interface Rating {
  stallNm: number;
  ratedNm: number;
  ratedEstimated: boolean;
  volts: number;
}

export interface LoadVerdict {
  status: LoadStatus;
  stallShare: number;
  heatShare: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function pointsOf(a: ActuatorSpec): ActuatorPoint[] {
  const base: ActuatorPoint = { volts: a.atVolts, stallNm: a.stallNm, ratedNm: a.ratedNm };

  return [base, ...(a.curve ?? [])].sort((x, y) => x.volts - y.volts);
}

function between(points: ActuatorPoint[], volts: number): [ActuatorPoint, ActuatorPoint, number] {
  const hi = points.findIndex((p) => p.volts >= volts);
  const edge = hi < 0 ? points[points.length - 1] : points[0];

  if (hi <= 0) return [edge, edge, 0];

  const a = points[hi - 1],
    b = points[hi];

  return [a, b, (volts - a.volts) / (b.volts - a.volts)];
}

function ratedAt(points: ActuatorPoint[], volts: number): number | undefined {
  const rated = points.filter((p) => p.ratedNm !== undefined);

  if (!rated.length) return undefined;

  const [a, b, t] = between(rated, volts);

  return lerp(a.ratedNm!, b.ratedNm!, t);
}

export function ratingAt(a: ActuatorSpec, supplyVolts?: number): Rating {
  const points = pointsOf(a);
  const top = Math.min(a.volts[1], points[points.length - 1].volts);
  const volts = Math.min(top, Math.max(a.volts[0], supplyVolts ?? a.atVolts));
  const [p, q, t] = between(points, volts);
  const below = volts < points[0].volts ? volts / points[0].volts : 1;
  const stallNm = lerp(p.stallNm, q.stallNm, t) * below;
  const rated = ratedAt(points, volts);

  return {
    stallNm,
    ratedNm: rated ?? RATED_OF_STALL * stallNm,
    ratedEstimated: rated === undefined,
    volts,
  };
}

export const suitsVolts = (a: ActuatorSpec, volts: number) => volts >= a.volts[0] - 1e-6 && volts <= a.volts[1] + 1e-6;

const worse = (x: LoadStatus, y: LoadStatus): LoadStatus => {
  const order: LoadStatus[] = ['pass', 'warn', 'fail'];

  return order[Math.max(order.indexOf(x), order.indexOf(y))];
};

const grade = (share: number, limits: { pass: number; warn: number }): LoadStatus => {
  if (share <= limits.pass) return 'pass';

  return share <= limits.warn ? 'warn' : 'fail';
};

export function stanceVerdict(loadNm: number, r: Rating, rmsNm = RMS_OF_STANCE * loadNm): LoadVerdict {
  const stallShare = loadNm / r.stallNm;
  const heatShare = rmsNm / r.ratedNm;

  return {
    status: worse(grade(stallShare, STANCE_LIMITS), grade(heatShare, HEAT_LIMITS)),
    stallShare,
    heatShare,
  };
}

export function holdVerdict(loadNm: number, r: Rating): LoadVerdict {
  const stallShare = loadNm / r.stallNm;
  const heatShare = loadNm / r.ratedNm;
  const heat: LoadStatus = heatShare <= 1 ? 'pass' : 'warn';

  return { status: worse(grade(stallShare, HOLD_LIMITS), heat), stallShare, heatShare };
}

export function crouchTorque(weightN: number, leverMm: number, crouchDeg: number): number {
  return (weightN * Math.abs(leverMm) * Math.sin((crouchDeg * Math.PI) / 360)) / 1000;
}
