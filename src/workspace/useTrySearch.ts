import { useEffect, useState } from 'react';
import { useTries } from '../cases/tryStore';
import { onSearchChanged, searchTries } from '../cases/trySearch/trySearchClient';
import type { TryHit } from '../cases/trySearch/types';

export function useTrySearch(text: string): TryHit[] | null {
  const query = text.trim();
  const tries = useTries();
  const [found, setFound] = useState<{ query: string; hits: TryHit[] } | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => onSearchChanged(() => setVersion((v) => v + 1)), []);

  useEffect(() => {
    if (!query) return;

    let live = true;

    searchTries(query).then(
      (hits) => live && setFound({ query, hits }),
      () => live && setFound({ query, hits: [] }),
    );

    return () => {
      live = false;
    };
  }, [query, tries, version]);

  return query && found?.query === query ? found.hits : null;
}

export const hitKey = (hit: TryHit) => `${hit.tryId}/${hit.segmentId ?? ''}/${hit.at}`;

export const likeQuery = (hit: Pick<TryHit, 'tryId' | 'segmentId'>) =>
  `like:${hit.tryId}${hit.segmentId ? `/${hit.segmentId}` : ''}`;
