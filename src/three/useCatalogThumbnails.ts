import { useEffect, useEffectEvent, useState, type Dispatch, type SetStateAction } from 'react';
import { PART_CATALOG, catalogKey } from '../data/catalog';
import type { CatalogItem } from '../types/robotics';
import { getCachedThumbnail, renderCatalogThumbnail } from './partThumbnails';
import { loadComponentMesh } from './componentMeshes';

type SetThumbs = Dispatch<SetStateAction<Record<string, string>>>;

function renderComponentThumbnails(items: CatalogItem[], isCancelled: () => boolean, setThumbs: SetThumbs) {
  for (const item of items) {
    loadComponentMesh(item.componentId!)
      .then(() => {
        if (isCancelled()) return;

        const url = renderCatalogThumbnail(item);

        if (url) setThumbs((prev) => ({ ...prev, [catalogKey(item)]: url }));
      })
      .catch(() => {});
  }
}

function renderShapeThumbnailsInFrames(pending: CatalogItem[], isCancelled: () => boolean, setThumbs: SetThumbs) {
  let idx = 0;
  const step = () => {
    if (isCancelled()) return;

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
}

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
    const missing = items.filter((i) => !getCachedThumbnail(catalogKey(i)));

    if (missing.length === 0) return;

    renderComponentThumbnails(
      missing.filter((i) => i.componentId),
      isCancelled,
      setThumbs,
    );

    const pending = missing.filter((i) => !i.componentId);

    if (pending.length > 0) renderShapeThumbnailsInFrames(pending, isCancelled, setThumbs);
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
