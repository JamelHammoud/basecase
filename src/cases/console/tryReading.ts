import type { Trip } from '../tripFrames';
import type { SignalTrack } from './recordedSignals';
import { matches } from './signalNames';

export const MAX_POINTS = 200;
export const POINT_BUDGET = 4800;

const MIN_POINTS = 20;
const EPSILON = 1e-9;

type Extreme = [value: number, at: number];

export interface SignalReading {
  v: Array<number | null>;
  min: Extreme | null;
  max: Extreme | null;
}

export interface FailureReading {
  label: string;
  at: number;
  values: Record<string, number>;
}

export interface TryReading {
  seconds: number;
  from: number;
  to: number;
  step: number;
  t: number[];
  signals: Record<string, SignalReading>;
  failures: FailureReading[];
  unknown: string[];
}

export interface ReadingRequest {
  track: SignalTrack;
  trips: readonly Trip[];
  dt: number;
  from?: number;
  to?: number;
  signals?: readonly string[];
}

export function rounded(value: number): number {
  if (!Number.isFinite(value) || value === 0) return value;

  const decimals = Math.min(6, Math.max(0, 2 - Math.floor(Math.log10(Math.abs(value)))));
  const scale = 10 ** decimals;

  return Math.round(value * scale) / scale;
}

const seconds = (value: number) => Math.round(value * 1000) / 1000;

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

function windowFrames(t: number[], from: number, to: number): [number, number] {
  const first = t.findIndex((time) => time >= from - EPSILON);
  const last = t.findLastIndex((time) => time <= to + EPSILON);

  if (first < 0 || last < first) {
    const nearest = Math.max(0, first < 0 ? t.length - 1 : first);

    return [nearest, nearest];
  }

  return [first, last];
}

export function sampleFrames(first: number, last: number, points: number): number[] {
  const span = last - first;
  const stride = Math.max(1, Math.ceil(span / Math.max(points - 1, 1)));
  const frames: number[] = [];

  for (let n = first; n <= last; n += stride) frames.push(n);

  if (frames.at(-1) !== last) frames.push(last);

  return frames;
}

function wanted(track: SignalTrack, patterns: readonly string[] | undefined) {
  const numbers = [...track.numbers.keys()];

  if (!patterns?.length) return { ids: numbers.filter((id) => id !== 'time'), unknown: [] };

  const labels = [...track.labels.keys()];
  const ids = new Set<string>();
  const unknown: string[] = [];

  for (const pattern of patterns) {
    const found = numbers.filter((id) => matches(pattern, id));

    found.forEach((id) => ids.add(id));

    if (!found.length && !labels.some((id) => matches(pattern, id))) unknown.push(pattern);
  }

  return { ids: [...ids], unknown };
}

function extremes(values: number[], t: number[], [first, last]: [number, number]) {
  let min: Extreme | null = null;
  let max: Extreme | null = null;

  for (let n = first; n <= last; n++) {
    const value = values[n];

    if (Number.isNaN(value)) continue;

    if (!min || value < min[0]) min = [value, t[n]];

    if (!max || value > max[0]) max = [value, t[n]];
  }

  const shown = (e: Extreme | null): Extreme | null => e && [rounded(e[0]), seconds(e[1])];

  return { min: shown(min), max: shown(max) };
}

function readSignal(values: number[], t: number[], frames: number[], span: [number, number]): SignalReading {
  return {
    v: frames.map((n) => (Number.isNaN(values[n]) ? null : rounded(values[n]))),
    ...extremes(values, t, span),
  };
}

function failureValues(track: SignalTrack, ids: string[], frame: number) {
  return Object.fromEntries(
    ids.flatMap((id) => {
      const value = track.numbers.get(id)?.[frame];

      return value === undefined || Number.isNaN(value) ? [] : [[id, rounded(value)]];
    }),
  );
}

export const pointsPerSignal = (count: number) =>
  Math.min(MAX_POINTS, Math.max(MIN_POINTS, Math.floor(POINT_BUDGET / Math.max(count, 1))));

export function tryReading(request: ReadingRequest): TryReading {
  const { track, trips, dt } = request;
  const end = track.t.at(-1) ?? 0;
  const from = clamp(request.from ?? 0, 0, end);
  const to = clamp(request.to ?? end, from, end);
  const span = windowFrames(track.t, from, to);
  const { ids, unknown } = wanted(track, request.signals);
  const frames = sampleFrames(span[0], span[1], pointsPerSignal(ids.length));
  const stride = frames.length > 1 ? frames[1] - frames[0] : 1;
  const firstTrips = trips.filter((trip, i) => trips.findIndex((other) => other.label === trip.label) === i);

  return {
    seconds: seconds(end),
    from: seconds(from),
    to: seconds(to),
    step: seconds(stride * dt),
    t: frames.map((n) => seconds(track.t[n])),
    signals: Object.fromEntries(ids.map((id) => [id, readSignal(track.numbers.get(id)!, track.t, frames, span)])),
    failures: firstTrips.map((trip) => ({
      label: trip.label,
      at: Math.round(trip.frame * dt * 100) / 100,
      values: failureValues(track, ids, Math.min(trip.frame, track.t.length - 1)),
    })),
    unknown,
  };
}

export function captureTime(reading: TryReading, at: number | undefined): number {
  if (at !== undefined) return clamp(at, 0, reading.seconds);

  return reading.failures.find((f) => f.at >= reading.from && f.at <= reading.to)?.at ?? reading.from;
}
