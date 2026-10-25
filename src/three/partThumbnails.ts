import { useEffect, useEffectEvent, useState } from 'react';
import { catalogKey, catalogRef } from '../data/catalog';
import type { CatalogItem, ScenePart } from '../types/robotics';
import { renderThumbnailImage } from './thumbnailClient';
import type { ThumbnailJob } from './thumbnailRender';

const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

function partFromCatalog(item: CatalogItem): ScenePart {
  return {
    id: `thumb-${item.kind}`,
    name: item.name,
    kind: item.kind,
    category: item.category,
    role: item.defaultRole,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    dimensions: { ...item.defaultDimensions },
    color: item.defaultColor,
    note: '',
    visible: true,
    locked: false,
    hardware: item.hardware,
    componentId: item.componentId,
  };
}

export const thumbnailParts = (parts: ScenePart[]) =>
  parts.filter((p) => p.visible && p.kind !== 'image_plane' && p.role === 'solid');

export const renderPartGroups = (parts: ScenePart[], options: Omit<ThumbnailJob, 'parts'>): Promise<string> =>
  renderThumbnailImage({ parts, ...options });

const remember = (key: string, render: () => Promise<string>): Promise<string> => {
  const cached = cache.get(key);

  if (cached !== undefined) return Promise.resolve(cached);

  const running = inflight.get(key);

  if (running) return running;

  const job = render()
    .catch(() => '')
    .then((url) => {
      cache.set(key, url);
      inflight.delete(key);

      return url;
    });

  inflight.set(key, job);

  return job;
};

export const renderCatalogThumbnail = (item: CatalogItem, key = catalogKey(item)): Promise<string> =>
  remember(key, () => renderPartGroups([partFromCatalog(item)], { tightness: 0.92 }));

export function renderPartsThumbnail(parts: ScenePart[], key: string): Promise<string> {
  const shown = thumbnailParts(parts);

  return shown.length ? remember(key, () => renderPartGroups(shown, { tightness: 1.0 })) : Promise.resolve('');
}

export function getCachedThumbnail(key: string): string | undefined {
  return cache.get(key);
}

function useThumbnail(key: string, render: () => Promise<string>): string | undefined {
  const [state, setState] = useState<{ key: string; url?: string }>(() => ({ key, url: getCachedThumbnail(key) }));
  const renderLatest = useEffectEvent(render);

  useEffect(() => {
    if (!key || getCachedThumbnail(key) !== undefined) return;

    let cancelled = false;

    renderLatest()
      .then((url) => {
        if (!cancelled) setState({ key, url });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [key]);

  return state.key === key ? state.url : getCachedThumbnail(key);
}

export function usePartThumbnail(item: CatalogItem | undefined): string | undefined {
  return useThumbnail(item ? catalogRef(item) : '', () =>
    item ? renderCatalogThumbnail(item, catalogRef(item)) : Promise.resolve(''),
  );
}

export function usePartsThumbnail(key: string, getParts: () => ScenePart[]): string | undefined {
  return useThumbnail(key, () => renderPartsThumbnail(getParts(), key));
}
