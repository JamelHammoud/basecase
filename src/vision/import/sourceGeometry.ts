import type { ImageAnnotation, ImageKeypoint } from '../frameSet';
import { decodeMask, encodeMask, maskBox, maskPolygons } from '../imageMasks';
import { IMAGE_LIMITS, list, number, record, refuseImage } from './sourceFiles';

function compressedRuns(text: string, pixels: number): number[] {
  if (text.length > Math.min(pixels * 7 + 7, IMAGE_LIMITS.metadata)) refuseImage();

  const counts: number[] = [];
  let at = 0;

  while (at < text.length) {
    let value = 0;
    let shift = 0;
    let byte: number;

    do {
      byte = text.charCodeAt(at++) - 48;

      if (!Number.isFinite(byte) || byte < 0 || byte > 63 || shift > 25) refuseImage();

      value += (byte & 31) * 2 ** shift;
      shift += 5;
    } while (byte & 32);

    if (byte & 16) value -= 2 ** shift;

    if (counts.length > 2) value += counts[counts.length - 2];

    if (
      !Number.isSafeInteger(value) ||
      value < 0 ||
      value > pixels ||
      counts.length >= Math.min(pixels + 1, IMAGE_LIMITS.points)
    )
      refuseImage();

    counts.push(value);
  }

  return counts;
}

export function polygonPixels(polygons: unknown, width: number, height: number): Uint8Array {
  const rings = list(polygons, 1000).map((polygon) => list(polygon, IMAGE_LIMITS.points).map(number));

  if (
    rings.reduce((sum, ring) => sum + ring.length, 0) > IMAGE_LIMITS.points ||
    rings.reduce((sum, ring) => sum + ring.length * height, 0) > 64_000_000 ||
    rings.some((ring) => ring.length < 6 || ring.length % 2)
  )
    refuseImage();

  const pixels = new Uint8Array(width * height);

  for (const ring of rings) fillPolygon(pixels, ring, width, height);

  return pixels;
}

function fillPolygon(pixels: Uint8Array, ring: number[], width: number, height: number): void {
  if (ring.some((v) => Math.abs(v) > 1_000_000)) refuseImage();

  let minY = Infinity;
  let maxY = -Infinity;

  for (let i = 1; i < ring.length; i += 2) {
    minY = Math.min(minY, ring[i]);
    maxY = Math.max(maxY, ring[i]);
  }

  const end = Math.min(height, Math.ceil(maxY));
  const intersections: number[] = [];

  for (let y = Math.max(0, Math.floor(minY)); y < end; y++) {
    intersections.length = 0;

    for (let i = 0; i < ring.length; i += 2) {
      const next = (i + 2) % ring.length;
      const ax = ring[i];
      const ay = ring[i + 1];
      const bx = ring[next];
      const by = ring[next + 1];

      if (ay > y + 0.5 === by > y + 0.5) continue;

      intersections.push(ax + ((y + 0.5 - ay) * (bx - ax)) / (by - ay));
    }

    intersections.sort((a, b) => a - b);

    for (let i = 0; i + 1 < intersections.length; i += 2) {
      const left = Math.max(0, Math.ceil(intersections[i] - 0.5));
      const right = Math.min(width, Math.ceil(intersections[i + 1] - 0.5));

      if (right > left) pixels.fill(1, y * width + left, y * width + right);
    }
  }
}

export function boxPixels(value: unknown, width: number, height: number): Uint8Array {
  const box = list(value, 4).map(number);

  if (box.length !== 4 || box[2] <= 0 || box[3] <= 0 || box.some((v) => Math.abs(v) > 1_000_000)) refuseImage();

  const [x, y, w, h] = box;

  return polygonPixels([[x, y, x + w, y, x + w, y + h, x, y + h]], width, height);
}

export function sourcePixels(value: Record<string, unknown>, width: number, height: number): Uint8Array {
  if (Array.isArray(value.segmentation) && value.segmentation.length)
    return polygonPixels(value.segmentation, width, height);

  if (value.segmentation && !Array.isArray(value.segmentation)) return rlePixels(value.segmentation, width, height);

  return boxPixels(value.bbox, width, height);
}

function rlePixels(value: unknown, width: number, height: number): Uint8Array {
  const mask = record(value);
  const size = list(mask.size, 2).map(number);

  if (size[0] !== height || size[1] !== width) refuseImage();

  const counts =
    typeof mask.counts === 'string'
      ? compressedRuns(mask.counts, width * height)
      : list(mask.counts, Math.min(width * height + 1, IMAGE_LIMITS.points)).map(number);

  return decodeMask({ size: [height, width], counts });
}

export interface AnnotationPixels {
  pixels: Uint8Array;
  width: number;
  height: number;
  instance: string;
  classId: number;
  keypoints?: ImageKeypoint[];
}

export function annotationPixels(input: AnnotationPixels): ImageAnnotation {
  const { pixels, width, height, instance, classId, keypoints = [] } = input;
  const box = maskBox(pixels, width, height) ?? refuseImage();

  return {
    instance,
    classId,
    box,
    mask: encodeMask(pixels, width, height),
    polygons: maskPolygons(pixels, width, height),
    keypoints,
  };
}

export function sourcePoints(value: unknown, names: string[], dimensions: [number, number]): ImageKeypoint[] {
  if (value === undefined) return [];

  const values = list(value, 768).map(number);

  if (values.length !== names.length * 3) refuseImage();

  return names.flatMap((name, i) => {
    const [x, y, visibility] = values.slice(i * 3, i * 3 + 3);

    if (
      ![0, 1, 2].includes(visibility) ||
      (visibility > 0 && (x < 0 || y < 0 || x >= dimensions[0] || y >= dimensions[1]))
    )
      refuseImage();

    return visibility === 0 ? [] : [{ name, x, y, visible: visibility === 2 }];
  });
}
