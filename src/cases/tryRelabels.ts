import type { TrySummary, TryVerdict } from './tryFile';
import { cleanTag, withTags, type Mark } from './tryLabels';

type Judging = Pick<TrySummary, 'outcome' | 'judged' | 'mark'>;

export const markable = (summary: Judging) => summary.outcome.verdict === 'unjudged' && !summary.judged;

export function summaryVerdict(summary: Judging): TryVerdict {
  if (summary.outcome.verdict !== 'unjudged') return summary.outcome.verdict;

  return summary.judged ?? summary.mark ?? 'unjudged';
}

export function markChanges(summaries: TrySummary[], ids: string[], mark: Mark) {
  const targets = summaries.filter((s) => ids.includes(s.id));

  if (!targets.length || !targets.every(markable)) return [];

  return targets.map((s) => ({ id: s.id, patch: { mark } }));
}

export function tagChanges(summaries: TrySummary[], ids: string[], tag: string) {
  const clean = cleanTag(tag);

  if (!clean) return [];

  return summaries
    .filter((s) => ids.includes(s.id))
    .map((s) => ({ id: s.id, patch: { tags: withTags(s.tags, [clean]) } }));
}
