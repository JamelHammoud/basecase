import { useEffect, useEffectEvent, useState } from 'react';
import { PART_CATALOG, catalogKey } from '../data/catalog';
import type { CatalogItem } from '../types/robotics';
import { getCachedThumbnail, renderCatalogThumbnail } from './partThumbnails';

export function useCatalogThumbnails(items: CatalogItem[] = PART_CATALOG) {
  const [thumbs, setThumbs] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};

    for (const item of items) {
      const t = getCachedThumbnail(catalogKey(item));

      if (t) initial[catalogKey(item)] = t;
    }

    return initial;
  });

  const renderMissing = useEffectEvent((isCancelled: () => boolean) => {
    for (const item of items.filter((i) => !getCachedThumbnail(catalogKey(i)))) {
      void renderCatalogThumbnail(item).then((url) => {
        if (url && !isCancelled()) setThumbs((prev) => ({ ...prev, [catalogKey(item)]: url }));
      });
    }
  });

  useEffect(() => {
    let cancelled = false;

    renderMissing(() => cancelled);

    return () => {
      cancelled = true;
    };
  }, []);

  return thumbs;
}
