import type { DatasetEpisode } from './lerobotRows';

const SPLITS = ['train', 'validation', 'test'] as const;

export function lerobotSplits(episodes: Pick<DatasetEpisode, 'split'>[]): Record<string, string> {
  if (episodes.every((episode) => episode.split === undefined)) {
    return { train: `0:${episodes.length}` };
  }

  if (episodes.some((episode) => !episode.split || !SPLITS.includes(episode.split))) {
    throw new Error('Assign a split to every episode.');
  }

  const ranges: Record<string, string> = {};

  for (const split of SPLITS) {
    const indices = episodes.flatMap((episode, index) => (episode.split === split ? [index] : []));

    if (indices.length === 0) {
      continue;
    }

    const from = indices[0];
    const to = indices[indices.length - 1] + 1;

    if (to - from !== indices.length) {
      throw new Error('Group episodes by split before exporting.');
    }

    ranges[split] = `${from}:${to}`;
  }

  return ranges;
}
