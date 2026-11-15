import type { TrySplit } from '../../cases/tryFile';
import { isRecord, unreadable } from './lerobotSource';
import { IMPORT_LIMITS } from './types';

export interface EpisodeSplitRange {
  from: number;
  to: number;
  split: TrySplit;
}

const SPLITS: Record<string, TrySplit> = { train: 'train', val: 'validation', validation: 'validation', test: 'test' };
const PATH = 'meta/info.json';

function indexRanges(value: unknown[], split: TrySplit): EpisodeSplitRange[] {
  const bounded = value.length <= IMPORT_LIMITS.episodes;
  const indices =
    bounded &&
    value.every((v) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v < Number.MAX_SAFE_INTEGER);

  if (!indices) return unreadable(PATH);

  return (value as number[]).map((index) => ({ from: index, to: index + 1, split }));
}

function rangesOf(value: unknown, split: TrySplit): EpisodeSplitRange[] {
  if (Array.isArray(value)) return indexRanges(value, split);

  if (typeof value !== 'string' || !/^\d+:\d+$/.test(value)) return unreadable(PATH);

  const [from, to] = value.split(':').map(Number);

  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from > to) return unreadable(PATH);

  return from === to ? [] : [{ from, to, split }];
}

function joinedRanges(ranges: EpisodeSplitRange[]): EpisodeSplitRange[] {
  const joined: EpisodeSplitRange[] = [];

  for (const range of ranges.toSorted((a, b) => a.from - b.from || a.to - b.to)) {
    const previous = joined.at(-1);

    if (!previous || previous.to <= range.from) {
      joined.push({ ...range });

      continue;
    }

    if (previous.split !== range.split) return unreadable(PATH);

    previous.to = Math.max(previous.to, range.to);
  }

  return joined;
}

export function readEpisodeSplits(value: unknown): EpisodeSplitRange[] {
  if (value === undefined) return [];

  if (!isRecord(value)) return unreadable(PATH);

  const ranges = Object.entries(value).flatMap(([name, declaration]) => {
    const split = Object.hasOwn(SPLITS, name) ? SPLITS[name] : undefined;

    return split ? rangesOf(declaration, split) : [];
  });

  return joinedRanges(ranges);
}

export function episodeSplit(ranges: EpisodeSplitRange[], index: number): TrySplit | undefined {
  let lower = 0;
  let upper = ranges.length;

  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2);
    const range = ranges[middle];

    if (index < range.from) upper = middle;
    else if (index >= range.to) lower = middle + 1;
    else return range.split;
  }

  return undefined;
}
