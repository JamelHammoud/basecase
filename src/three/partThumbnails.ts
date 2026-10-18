import * as THREE from 'three';
import { useEffect, useEffectEvent, useState } from 'react';
import { catalogKey, catalogRef } from '../data/catalog';
import type { CatalogItem, ScenePart } from '../types/robotics';
import { buildPartGroup, releasePartGroup } from './buildPartMesh';
import { getComponentMesh, loadComponentMesh } from './componentMeshes';
import { renderThumbnail } from './thumbnailStage';

const cache = new Map<string, string>();

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

export function renderPartGroups(parts: ScenePart[], options: { tightness: number; mime?: string }): string {
  const groups = parts.map((part) => buildPartGroup(part, false, { shareGeometry: true }));
  const root = new THREE.Group().add(...groups);

  try {
    return renderThumbnail(root, options);
  } finally {
    groups.forEach(releasePartGroup);
  }
}

const remember = (key: string, render: () => string) => {
  try {
    const url = render();

    cache.set(key, url);

    return url;
  } catch {
    return '';
  }
};

export function renderCatalogThumbnail(item: CatalogItem, key = catalogKey(item)): string {
  const cached = cache.get(key);

  if (cached) {
    return cached;
  }

  if (item.componentId && !getComponentMesh(item.componentId)) {
    return '';
  }

  return remember(key, () => renderPartGroups([partFromCatalog(item)], { tightness: 0.92 }));
}

export function renderPartsThumbnail(parts: ScenePart[], key: string): string {
  const cached = cache.get(key);

  if (cached) {
    return cached;
  }

  const shown = thumbnailParts(parts);

  return shown.length ? remember(key, () => renderPartGroups(shown, { tightness: 1.0 })) : '';
}

export function getCachedThumbnail(key: string): string | undefined {
  return cache.get(key);
}

export async function loadPartMeshes(parts: ScenePart[]): Promise<void> {
  const ids = new Set(parts.flatMap((p) => (p.componentId ? [p.componentId] : [])));

  await Promise.allSettled([...ids].map((id) => loadComponentMesh(id)));
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

function useThumbnail(key: string, render: () => Promise<string>): string | undefined {
  const [state, setState] = useState<{ key: string; url?: string }>(() => ({ key, url: getCachedThumbnail(key) }));
  const renderLatest = useEffectEvent(render);

  useEffect(() => {
    if (!key || getCachedThumbnail(key) !== undefined) return;

    let cancelled = false;

    renderLatest()
      .then((url) => {
        if (!url) cache.set(key, '');

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
  return useThumbnail(item ? catalogRef(item) : '', async () => {
    if (!item) return '';

    if (item.componentId) await loadComponentMesh(item.componentId);

    await nextFrame();

    return renderCatalogThumbnail(item, catalogRef(item));
  });
}

export function usePartsThumbnail(key: string, getParts: () => ScenePart[]): string | undefined {
  return useThumbnail(key, async () => {
    const parts = getParts();

    await loadPartMeshes(thumbnailParts(parts));
    await nextFrame();

    return renderPartsThumbnail(parts, key);
  });
}
