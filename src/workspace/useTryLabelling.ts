import { useState } from 'react';
import type { TrySummary } from '../cases/tryFile';
import { tagChanges } from '../cases/tryRelabels';
import { relabelTries } from '../cases/tryStore';
import type { ContextMenuEntry } from '../design-system';
import { errorMessage } from '../utils/errorMessage';
import type { ShowToast } from './types';

export const TAG_ITEM = 'Tag';

export function useTryLabelling(summaries: TrySummary[], showToast: ShowToast) {
  const [tagging, setTagging] = useState<string[] | null>(null);

  const tagTries = (ids: string[], tag: string) => {
    const changes = tagChanges(summaries, ids, tag);

    if (!changes.length) return false;

    relabelTries(changes).catch((e: unknown) => showToast(errorMessage(e), { tone: 'error' }));

    return true;
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
    entries: (ids: string[], askTag: (ids: string[]) => void = setTagging): ContextMenuEntry[] => [
      { label: TAG_ITEM, onSelect: () => askTag(ids) },
    ],
  };
}

export type TryLabelling = ReturnType<typeof useTryLabelling>;
