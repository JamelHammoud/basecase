import * as THREE from 'three';
import type { ScenePart } from '../types/robotics';
import { buildPartGroup, releasePartGroup } from './buildPartMesh';
import { loadComponentMesh } from './componentMeshes';
import { canvasBlob, drawThumbnail, type ThumbnailCanvas } from './thumbnailStage';

export interface ThumbnailJob {
  parts: ScenePart[];
  tightness: number;
  mime?: string;
  quality?: number;
  cropWidth?: number;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const CROP_MARGIN = 0.06;

export async function loadPartMeshes(parts: ScenePart[]): Promise<void> {
  const ids = new Set(parts.flatMap((p) => (p.componentId ? [p.componentId] : [])));

  await Promise.allSettled([...ids].map((id) => loadComponentMesh(id)));
}

function opaqueBounds(data: Uint8ClampedArray, width: number, height: number): Box | null {
  const box = { x0: width, y0: height, x1: -1, y1: -1 };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] < 8) continue;

      box.x0 = Math.min(box.x0, x);
      box.x1 = Math.max(box.x1, x);
      box.y0 = Math.min(box.y0, y);
      box.y1 = Math.max(box.y1, y);
    }
  }

  return box.x1 < 0 ? null : box;
}

function canvas2d(width: number, height: number): ThumbnailCanvas {
  if (typeof document === 'undefined') return new OffscreenCanvas(width, height);

  const canvas = document.createElement('canvas');

  canvas.width = width;
  canvas.height = height;

  return canvas;
}

const context2d = (canvas: ThumbnailCanvas) =>
  canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;

function cropToContent(source: ThumbnailCanvas, width: number): ThumbnailCanvas | null {
  const copy = canvas2d(source.width, source.height);
  const copyCtx = context2d(copy);

  copyCtx.drawImage(source, 0, 0);

  const box = opaqueBounds(copyCtx.getImageData(0, 0, copy.width, copy.height).data, copy.width, copy.height);

  if (!box) return null;

  const height = Math.round((width * 3) / 4);
  const bw = box.x1 - box.x0 + 1;
  const bh = box.y1 - box.y0 + 1;
  const scale = Math.min((width * (1 - 2 * CROP_MARGIN)) / bw, (height * (1 - 2 * CROP_MARGIN)) / bh);
  const out = canvas2d(width, height);
  const ctx = context2d(out);
  const dw = bw * scale;
  const dh = bh * scale;

  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(copy, box.x0, box.y0, bw, bh, (width - dw) / 2, (height - dh) / 2, dw, dh);

  return out;
}

function finish(canvas: ThumbnailCanvas, job: ThumbnailJob): Promise<Blob | null> {
  const mime = job.mime ?? 'image/png';
  const quality = job.quality ?? 0.85;

  if (!job.cropWidth) return canvasBlob(canvas, mime, quality);

  const cropped = cropToContent(canvas, job.cropWidth);

  return cropped ? canvasBlob(cropped, mime, quality) : Promise.resolve(null);
}

export async function renderThumbnailJob(job: ThumbnailJob): Promise<Blob | null> {
  if (!job.parts.length) return null;

  await loadPartMeshes(job.parts);

  const groups = job.parts.map((part) => buildPartGroup(part, false, { shareGeometry: true }));
  const root = new THREE.Group().add(...groups);

  try {
    return await finish(drawThumbnail(root, job.tightness), job);
  } finally {
    groups.forEach(releasePartGroup);
  }
}
