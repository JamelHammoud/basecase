import { useSyncExternalStore } from 'react';
import type { ScenePart } from '../types/robotics';
import { renderPartsThumbnail } from '../three/partThumbnails';

/**
 * Robot previews: the imported links rendered like the Library's thumbnails (three-quarter view,
 * transparent background) and saved as WebP. Every import makes one: preset previews ship in
 * public/robots/<id>.webp (tools/robots/previews.mjs runs the same import), and robots imported
 * from a link are remembered under Imported with theirs.
 */

/**
 * A WebP data URL of the robot in its modeled pose, 4:3; '' when there's nothing to show.
 * The render frames a bounding sphere, which leaves a tall humanoid small in a 4:3 tile, so the
 * image is cropped to the robot's own pixels (plus a margin) and centered.
 */
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
  let x0 = src.width, y0 = src.height, x1 = -1, y1 = -1;
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      if (data[(y * src.width + x) * 4 + 3] < 8) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return '';
  const height = Math.round((width * 3) / 4);
  const margin = 0.06;
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const scale = Math.min((width * (1 - 2 * margin)) / bw, (height * (1 - 2 * margin)) / bh);
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  const dw = bw * scale, dh = bh * scale;
  ctx.drawImage(src, x0, y0, bw, bh, (width - dw) / 2, (height - dh) / 2, dw, dh);
  return out.toDataURL('image/webp', quality);
}

/** Where a preset's shipped preview lives */
export const presetPreviewUrl = (id: string) => `${import.meta.env.BASE_URL}robots/${id}.webp`;

/* ------------------------------------------------------------------ */
/* Imported: robots inserted from a link, newest first                 */
/* ------------------------------------------------------------------ */

export interface ImportedRobot {
  url: string;
  name: string;
  joints: number;
  /** WebP data URL, 320 wide */
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
  } catch {
    // Full or blocked storage: keep the list for this session only
  }
  listeners.forEach((l) => l());
}

/** Robots inserted from a link, newest first */
export const listImportedRobots = (): ImportedRobot[] => read();

export function rememberImportedRobot(robot: ImportedRobot) {
  write([robot, ...read().filter((r) => r.url !== robot.url)].slice(0, LIMIT));
}

export function forgetImportedRobot(url: string) {
  write(read().filter((r) => r.url !== url));
}

export function useImportedRobots(): ImportedRobot[] {
  return useSyncExternalStore(
    (l) => {
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
    },
    read
  );
}
