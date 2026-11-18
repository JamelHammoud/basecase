import { channelValue, COMPARISON_LIMITS, type ComparisonChannel, type SamplingRule } from './comparison';

export interface PreparedPlot {
  t: number[];
  v: number[];
}

function bucket(channel: ComparisonChannel, from: number, to: number, rule: SamplingRule) {
  let low = Infinity;
  let high = -Infinity;
  let min = from;
  let max = from;
  let missing = -1;
  let gap = -1;

  for (let i = from; i < to; i++) {
    const value = channelValue(channel, i);

    if (i > 0 && gap < 0 && channel.t[i] - channel.t[i - 1] > rule.maxAge) gap = i;

    if (typeof value !== 'number') {
      missing = i;

      continue;
    }

    if (value < low) {
      low = value;
      min = i;
    }

    if (value > high) {
      high = value;
      max = i;
    }
  }

  return { indices: [...new Set([min, max, missing, gap].filter((i) => i >= 0))].sort((a, b) => a - b), gap };
}

function append(plot: PreparedPlot, channel: ComparisonChannel, i: number, gap: boolean) {
  if (gap) {
    plot.t.push((channel.t[i - 1] + channel.t[i]) / 2);
    plot.v.push(Number.NaN);
  }

  const value = channelValue(channel, i);

  plot.t.push(channel.t[i]);
  plot.v.push(typeof value === 'number' ? value : Number.NaN);
}

export function preparePlot(channel: ComparisonChannel, rule: SamplingRule): PreparedPlot {
  const plot: PreparedPlot = { t: [], v: [] };
  const count = channel.t.length;

  if (!count || channel.kind !== 'number' || !Number.isFinite(rule.maxAge) || rule.maxAge < 0) return plot;

  if (count <= COMPARISON_LIMITS.plot / 2) {
    for (let i = 0; i < count; i++) append(plot, channel, i, i > 0 && channel.t[i] - channel.t[i - 1] > rule.maxAge);

    return plot;
  }

  const buckets = Math.floor((COMPARISON_LIMITS.plot - 2) / 5);

  append(plot, channel, 0, false);

  for (let k = 0; k < buckets; k++) {
    const from = Math.floor((k * count) / buckets);
    const to = Math.floor(((k + 1) * count) / buckets);
    const selected = bucket(channel, from, to, rule);

    for (const i of selected.indices) append(plot, channel, i, i === selected.gap);
  }

  append(plot, channel, count - 1, false);

  return plot;
}
