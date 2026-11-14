import type { EpisodeStats } from './lerobotRows';

type Nested = number | Nested[];

const flat = (value: unknown[]): number[] => (value as Nested[]).flat(Infinity as 1) as number[];

function reshape(values: number[], like: unknown[]): unknown[] {
  let at = 0;

  const fill = (shape: unknown[]): unknown[] => shape.map((item) => (Array.isArray(item) ? fill(item) : values[at++]));

  return fill(like);
}

function aggregateFeature(stats: Record<string, unknown[]>[]): Record<string, unknown[]> {
  const like = stats[0];
  const means = stats.map((s) => flat(s.mean));
  const stds = stats.map((s) => flat(s.std));
  const mins = stats.map((s) => flat(s.min));
  const maxes = stats.map((s) => flat(s.max));
  const counts = stats.map((s) => flat(s.count)[0]);
  const total = counts.reduce((n, c) => n + c, 0);
  const columns = means[0].map((_, col) => col);
  const mean = columns.map((col) => means.reduce((n, m, i) => n + m[col] * counts[i], 0) / total);
  const std = columns.map((col) =>
    Math.sqrt(stds.reduce((n, s, i) => n + (s[col] ** 2 + (means[i][col] - mean[col]) ** 2) * counts[i], 0) / total),
  );

  return {
    min: reshape(
      columns.map((col) => Math.min(...mins.map((m) => m[col]))),
      like.min,
    ),
    max: reshape(
      columns.map((col) => Math.max(...maxes.map((m) => m[col]))),
      like.max,
    ),
    mean: reshape(mean, like.mean),
    std: reshape(std, like.std),
    count: [total],
  };
}

export function aggregateStats(episodes: EpisodeStats[]): EpisodeStats {
  const keys = Object.keys(episodes[0] ?? {});

  return Object.fromEntries(keys.map((key) => [key, aggregateFeature(episodes.map((e) => e[key]))]));
}
