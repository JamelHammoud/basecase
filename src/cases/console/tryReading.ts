import type { Trip } from '../tripFrames';
import { sampled, type RecordedTrack } from './recordedSignals';
import { matches } from './signalNames';

export const READ_TRY_SIGNALS = ['robot.*', 'goal.*'];
export const MAX_ROWS = 200;
export const MAX_SIGNALS = 32;

const DEFAULT_ROWS = 50;
const MAX_PATTERNS = 32;

export interface TryAsk {
  from?: number;
  to?: number;
  every?: number;
  at?: number;
  signals?: string[];
}

export interface TryFailure {
  label: string;
  time: number;
}

export interface TryReading {
  window: { from: number; to: number; every: number };
  samples: Record<string, Array<number | null>>;
  failures: TryFailure[];
  capture: number;
  unknown?: string[];
  left_out?: string[];
}

export const rounded = (v: number, places = 3) => {
  const r = Number(v.toFixed(places));

  return r === 0 ? 0 : r;
};

const finite = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

const clampTo = (v: number, end: number) => Math.max(0, Math.min(end, v));

export function tryAsk(payload: Record<string, unknown>): TryAsk {
  const listed = Array.isArray(payload.signals) ? payload.signals : [payload.signals];
  const signals = listed.flatMap((s) => (typeof s === 'string' && s.trim() ? [s.trim()] : [])).slice(0, MAX_PATTERNS);

  return {
    from: finite(payload.from),
    to: finite(payload.to),
    every: finite(payload.every),
    at: finite(payload.at),
    ...(signals.length ? { signals } : {}),
  };
}

export function tryFailures(track: RecordedTrack, trips: readonly Trip[]): TryFailure[] {
  return [...trips]
    .sort((a, b) => a.frame - b.frame)
    .map((t) => ({ label: t.label, time: rounded(track.time(t.frame)) }));
}

function windowFrames(track: RecordedTrack, ask: TryAsk) {
  const end = track.time(track.frames - 1);
  const a = clampTo(ask.from ?? 0, end);
  const b = clampTo(ask.to ?? end, end);
  const first = track.frameAt(Math.min(a, b));
  const last = track.frameAt(Math.max(a, b));
  const span = last - first;
  const asked = ask.every && ask.every > 0 ? Math.round(ask.every / track.dt) : Math.ceil(span / DEFAULT_ROWS);
  const step = Math.max(1, asked, Math.ceil(span / (MAX_ROWS - 1)));
  const rows: number[] = [];

  for (let n = first; n <= last; n += step) rows.push(n);

  if (rows.at(-1) !== last) rows.push(last);

  return { first, last, step, rows };
}

function signalsOf(track: RecordedTrack, patterns: readonly string[]) {
  const ids = sampled(track, patterns).filter((id) => id !== 'time');
  const unknown = patterns.filter((p) => !ids.some((id) => matches(p, id)));

  return { kept: ids.slice(0, MAX_SIGNALS), left: ids.slice(MAX_SIGNALS), unknown };
}

function columnAt(column: Float64Array | null, rows: readonly number[]) {
  return rows.map((n) => {
    const v = column?.[n];

    return v === undefined || Number.isNaN(v) ? null : rounded(v);
  });
}

export function tryReading(track: RecordedTrack, trips: readonly Trip[], ask: TryAsk): TryReading {
  const { first, last, step, rows } = windowFrames(track, ask);
  const { kept, left, unknown } = signalsOf(track, ask.signals ?? READ_TRY_SIGNALS);
  const failures = tryFailures(track, trips);
  const end = track.time(track.frames - 1);
  const capture = ask.at === undefined ? (failures[0]?.time ?? track.time(last)) : clampTo(ask.at, end);
  const samples: TryReading['samples'] = { time: rows.map((n) => rounded(track.time(n))) };

  for (const id of kept) samples[id] = columnAt(track.column(id), rows);

  return {
    window: { from: rounded(track.time(first)), to: rounded(track.time(last)), every: rounded(step * track.dt) },
    samples,
    failures,
    capture: rounded(track.time(track.frameAt(capture))),
    ...(unknown.length ? { unknown } : {}),
    ...(left.length ? { left_out: left } : {}),
  };
}
