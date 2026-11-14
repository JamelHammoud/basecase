import type React from 'react';
import { hasPrimaryModifier } from '../../utils/os';
import type { Hit } from './insertSearch';
import type { HitActions } from './lists';

interface SearchKeys {
  query: string;
  hits: Hit[];
  active: number;
  setActive: (i: number) => void;
  bodyRef: React.RefObject<HTMLDivElement | null>;
  actions: Omit<HitActions, 'busy'>;
  clear: () => void;
  back: (() => void) | null;
  searchNetwork: () => void;
}

const stepIndex = (active: number, key: string, count: number) =>
  (active + (key === 'ArrowDown' ? 1 : -1) + count) % count;

function addHit(hit: Hit, actions: SearchKeys['actions']) {
  if (hit.kind === 'part') actions.onAddPart(hit.item);
  else if (hit.kind === 'robot') actions.onInsertRobot(hit.robot);
  else actions.onOpenObjects(hit.category);
}

function openHit(hit: Hit | undefined, keys: SearchKeys) {
  if (hit?.kind === 'part') keys.actions.onOpenPart(hit.item);
  else if (hit?.kind === 'objects') keys.actions.onOpenObjects(hit.category);
  else keys.searchNetwork();
}

export function useSearchKeys(keys: SearchKeys) {
  const { query, hits, active } = keys;

  const onEscape = (e: React.KeyboardEvent) => {
    if (query) keys.clear();
    else if (keys.back) keys.back();
    else (e.target as HTMLInputElement).blur();
  };
  const onArrow = (e: React.KeyboardEvent) => {
    e.preventDefault();

    const next = stepIndex(active, e.key, hits.length);

    keys.setActive(next);
    keys.bodyRef.current?.querySelector(`[data-result="${next}"]`)?.scrollIntoView({ block: 'nearest' });
  };
  const onEnter = (e: React.KeyboardEvent) => {
    e.preventDefault();

    const hit = hits[active];

    if (hit && hasPrimaryModifier(e)) addHit(hit, keys.actions);
    else if (query.trim()) openHit(hit, keys);
  };

  return (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onEscape(e);
    else if (hits.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) onArrow(e);
    else if (e.key === 'Enter') onEnter(e);
  };
}
