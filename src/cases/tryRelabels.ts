import type { TrySummary } from './tryFile';
import { cleanTag, withTags } from './tryLabels';

export function tagChanges(summaries: TrySummary[], ids: string[], tag: string) {
  const clean = cleanTag(tag);

  if (!clean) return [];

  return summaries
    .filter((s) => ids.includes(s.id))
    .map((s) => ({ id: s.id, patch: { tags: withTags(s.tags, [clean]) } }));
}
