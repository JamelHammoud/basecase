import { useEffect, useState } from 'react';
import { PART_CATALOG, catalogKey } from '../data/catalog';
import type { CatalogItem } from '../types/robotics';
import { getCachedThumbnail, renderCatalogThumbnail } from './partThumbnails';
import { loadComponentMesh } from './componentMeshes';

/** Lazily renders thumbnails for these entries a few per frame; cached across mounts. */
export function useCatalogThumbnails(items: CatalogItem[] = PART_CATALOG) {
  const [thumbs, setThumbs] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const item of items) {
      const t = getCachedThumbnail(catalogKey(item));
      if (t) initial[catalogKey(item)] = t;
    }
    return initial;
  });

  useEffect(() => {
    const missing = items.filter((i) => !getCachedThumbnail(catalogKey(i)));
    if (missing.length === 0) return;
    let cancelled = false;
    // Components wait for their mesh, then render on their own
    for (const item of missing.filter((i) => i.componentId)) {
      loadComponentMesh(item.componentId!)
        .then(() => {
          if (cancelled) return;
          const url = renderCatalogThumbnail(item);
          if (url) setThumbs((prev) => ({ ...prev, [catalogKey(item)]: url }));
        })
        .catch(() => {});
    }
    const pending = missing.filter((i) => !i.componentId);
    if (pending.length === 0) return () => void (cancelled = true);
    let idx = 0;
    const step = () => {
      if (cancelled) return;
      const batch: Record<string, string> = {};
      const end = Math.min(idx + 4, pending.length);
      for (; idx < end; idx++) {
        const item = pending[idx];
        batch[catalogKey(item)] = renderCatalogThumbnail(item);
      }
      setThumbs((prev) => ({ ...prev, ...batch }));
      if (idx < pending.length) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    return () => {
      cancelled = true;
    };
    // The list is static per caller
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return thumbs;
}
