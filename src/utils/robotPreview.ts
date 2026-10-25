import { useSyncExternalStore } from 'react';
import type { ScenePart } from '../types/robotics';
import { renderPartGroups, thumbnailParts } from '../three/partThumbnails';

export const robotPreviewImage = (parts: ScenePart[], width = 480, quality = 0.86): Promise<string> =>
  renderPartGroups(thumbnailParts(parts), { tightness: 1.0, cropWidth: width, mime: 'image/webp', quality });

export const presetPreviewUrl = (id: string) => `${import.meta.env.BASE_URL}robots/${id}.webp`;

export interface ImportedRobot {
  url: string;
  name: string;
  joints: number;
  thumbnail: string;
  importedAt: string;
}

const KEY = 'robots-imported';
const LIMIT = 12;
const listeners = new Set<() => void>();
let snapshot: ImportedRobot[] | null = null;

function read(): ImportedRobot[] {
  if (snapshot) return snapshot;

  try {
    snapshot = JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    snapshot = [];
  }

  return snapshot!;
}

function write(list: ImportedRobot[]) {
  snapshot = list;

  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {}

  listeners.forEach((l) => l());
}

export const listImportedRobots = (): ImportedRobot[] => read();

export function rememberImportedRobot(robot: ImportedRobot) {
  write([robot, ...read().filter((r) => r.url !== robot.url)].slice(0, LIMIT));
}

export function forgetImportedRobot(url: string) {
  write(read().filter((r) => r.url !== url));
}

export function useImportedRobots(): ImportedRobot[] {
  return useSyncExternalStore((l) => {
    listeners.add(l);

    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY) return;

      snapshot = null;
      l();
    };

    window.addEventListener('storage', onStorage);

    return () => {
      listeners.delete(l);
      window.removeEventListener('storage', onStorage);
    };
  }, read);
}
