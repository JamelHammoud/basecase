import { useSyncExternalStore } from 'react';
import type { SavedSceneSummary } from '../types/robotics';

let scenes: SavedSceneSummary[] = [];
const listeners = new Set<() => void>();

const newest = (a: SavedSceneSummary, b: SavedSceneSummary) => (b.updatedAt || '').localeCompare(a.updatedAt || '');

function set(next: SavedSceneSummary[]) {
  scenes = next;
  listeners.forEach((listener) => listener());
}

export const sceneStore = {
  get: () => scenes,
  set,
  upsert(summary: SavedSceneSummary | null | undefined) {
    if (!summary?.id) return;

    set([summary, ...scenes.filter((s) => s.id !== summary.id)].sort(newest));
  },
  remove(id: string) {
    set(scenes.filter((s) => s.id !== id));
  },
  subscribe(listener: () => void) {
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  },
};

export function useSavedScenes(): SavedSceneSummary[] {
  return useSyncExternalStore(sceneStore.subscribe, sceneStore.get);
}
