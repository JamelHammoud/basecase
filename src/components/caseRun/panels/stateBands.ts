import type { SignalBus } from '../../../cases/console/signalBus';
import { numberLabel, stateSpans, stateValues, type StateSpan } from '../../../topics/states';

export const STATE_FILLS = [
  'rgba(13, 153, 255, 0.55)',
  'rgba(255, 255, 255, 0.24)',
  'rgba(13, 153, 255, 0.28)',
  'rgba(255, 255, 255, 0.12)',
  'rgba(255, 255, 255, 0.4)',
  'rgba(13, 153, 255, 0.8)',
];

const NOMINAL_WIDTH = 320;
const CHAR_WIDTH = 7;
const TEXT_INSET = 12;

export interface StateBand extends StateSpan {
  left: number;
  width: number;
  fill: string;
  named: boolean;
}

export interface StateRange {
  from: number;
  to: number;
}

export interface StateSource {
  t: ArrayLike<number>;
  values: ArrayLike<string>;
}

export function stateSource(bus: Pick<SignalBus, 'series' | 'topics'>, id: string): StateSource {
  const labels = bus.topics?.()?.labels(id);

  if (labels) return { t: labels.t, values: labels.v };

  const series = bus.series(id);

  return { t: series.t, values: series.v.map(numberLabel) };
}

export function stateRange(source: StateSource, end?: number): StateRange {
  const first = source.t.length ? source.t[0] : 0;
  const last = source.t.length ? source.t[source.t.length - 1] : 0;

  return end === undefined ? { from: first, to: last } : { from: Math.min(0, first), to: Math.max(end, last) };
}

const fraction = (time: number, range: StateRange) =>
  Math.min(1, Math.max(0, (time - range.from) / (range.to - range.from || 1)));

export function stateBands(source: StateSource, range: StateRange): StateBand[] {
  const spans = stateSpans(source.t, source.values, range.to);
  const values = stateValues(spans);

  return spans.map((span) => {
    const left = fraction(span.from, range);
    const width = Math.max(0, fraction(span.to, range) - left);

    return {
      ...span,
      left,
      width,
      fill: STATE_FILLS[values.indexOf(span.value) % STATE_FILLS.length],
      named: width * NOMINAL_WIDTH >= span.value.length * CHAR_WIDTH + TEXT_INSET,
    };
  });
}

export const timeAtFraction = (range: StateRange, at: number) => range.from + at * (range.to - range.from);

export const playheadFraction = fraction;
