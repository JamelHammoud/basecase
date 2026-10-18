import { useSyncExternalStore } from 'react';
import type { ScenePart } from '../types/robotics';
import { renderPartsThumbnail } from '../three/partThumbnails';

function opaqueBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = width,
    y0 = height,
    x1 = -1,
    y1 = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] < 8) continue;

      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  }

  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

export async function robotPreviewImage(parts: ScenePart[], key: string, width = 480, quality = 0.86): Promise<string> {
  const png = renderPartsThumbnail(parts, `robot:${key}`);

  if (!png) return '';

  const img = new Image();

  img.src = png;
  await img.decode();

  const src = document.createElement('canvas');

  src.width = img.width;
  src.height = img.height;

  const sctx = src.getContext('2d')!;

  sctx.drawImage(img, 0, 0);

  const { data } = sctx.getImageData(0, 0, src.width, src.height);
  const box = opaqueBounds(data, src.width, src.height);

  if (!box) return '';

  const { x0, y0, x1, y1 } = box;
  const height = Math.round((width * 3) / 4);
  const margin = 0.06;
  const bw = x1 - x0 + 1,
    bh = y1 - y0 + 1;
  const scale = Math.min((width * (1 - 2 * margin)) / bw, (height * (1 - 2 * margin)) / bh);
  const out = document.createElement('canvas');

  out.width = width;
  out.height = height;

  const ctx = out.getContext('2d')!;

  ctx.imageSmoothingQuality = 'high';

  const dw = bw * scale,
    dh = bh * scale;

  ctx.drawImage(src, x0, y0, bw, bh, (width - dw) / 2, (height - dh) / 2, dw, dh);

  return out.toDataURL('image/webp', quality);
}

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
