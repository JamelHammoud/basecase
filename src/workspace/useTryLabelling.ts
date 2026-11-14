import { useState } from 'react';
import type { TrySummary } from '../cases/tryFile';
import type { Mark } from '../cases/tryLabels';
import { markChanges, markable, tagChanges } from '../cases/tryRelabels';
import { relabelTries, type Relabel } from '../cases/tryStore';
import type { ContextMenuEntry } from '../design-system';
import { errorMessage } from '../utils/errorMessage';
import type { ShowToast } from './types';

export const TAG_ITEM = 'Tag…';

export const MARKS: ReadonlyArray<{ mark: Mark; label: string }> = [
  { mark: 'passed', label: 'Mark Passed' },
  { mark: 'failed', label: 'Mark Failed' },
];

export function useTryLabelling(summaries: TrySummary[], showToast: ShowToast) {
  const [tagging, setTagging] = useState<string[] | null>(null);

  const save = (changes: Relabel[]) => {
    if (!changes.length) return false;

    relabelTries(changes).catch((e: unknown) => showToast(errorMessage(e), { tone: 'error' }));

    return true;
  };

  const mark = (ids: string[], value: Mark) => save(markChanges(summaries, ids, value));
  const tagTries = (ids: string[], tag: string) => save(tagChanges(summaries, ids, tag));

  const marksFor = (ids: string[]) => {
    const targets = summaries.filter((s) => ids.includes(s.id));

    if (!targets.length || !targets.every(markable)) return [];

    return MARKS.filter((m) => targets.length > 1 || targets[0].mark !== m.mark);
  };

  return {
    tagging,
    askTag: (ids: string[]) => setTagging(ids.length ? ids : null),
    cancelTag: () => setTagging(null),
    tag: (tag: string) => {
      setTagging(null);

      return tagTries(tagging ?? [], tag);
    },
    tagTries,
    mark,
    entries: (ids: string[], askTag: (ids: string[]) => void = setTagging): ContextMenuEntry[] => [
      { label: TAG_ITEM, onSelect: () => askTag(ids) },
      ...marksFor(ids).map((m) => ({ label: m.label, onSelect: () => mark(ids, m.mark) })),
    ],
  };
}

export type TryLabelling = ReturnType<typeof useTryLabelling>;
