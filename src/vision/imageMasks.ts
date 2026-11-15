import type { ImageAnnotation, ImageKeypoint, ImageMask } from './frameSet';
import { traceMaskPolygons } from './maskPolygons';

function checkDimensions(pixels: ArrayLike<number>, width: number, height: number): void {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height > 16_777_216 ||
    pixels.length !== width * height
  ) {
    throw new Error('Check the mask image size.');
  }
}

export function encodeMask(pixels: Uint8Array, width: number, height: number): ImageMask {
  checkDimensions(pixels, width, height);

  const counts = [0];
  let previous = 0;

  for (let i = 0; i < pixels.length; i++) {
    const pixel = pixels[(i % height) * width + Math.floor(i / height)] ? 1 : 0;

    if (pixel !== previous) counts.push(0);

    counts[counts.length - 1]++;
    previous = pixel;
  }

  return { size: [height, width], counts };
}

export function decodeMask(mask: ImageMask): Uint8Array {
  const [height, width] = mask.size;
  const length = width * height;

  if (
    mask.size.length !== 2 ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    length > 16_777_216 ||
    mask.counts.length > length + 1 ||
    !mask.counts.length ||
    !mask.counts.every((v, i) => Number.isInteger(v) && v >= 0 && (v > 0 || i === 0)) ||
    mask.counts.reduce((sum, v) => sum + v, 0) !== length
  )
    throw new Error('Check the mask runs.');

  const pixels = new Uint8Array(length);
  let offset = 0;

  mask.counts.forEach((count, run) => {
    if (run % 2 === 0) {
      offset += count;

      return;
    }

    let row = offset % height;
    let pixel = row * width + Math.floor(offset / height);

    for (let i = 0; i < count; i++) {
      pixels[pixel] = 1;
      row++;
      pixel += width;

      if (row === height) {
        row = 0;
        pixel -= length - 1;
      }
    }

    offset += count;
  });

  return pixels;
}

export function maskBox(pixels: Uint8Array, width: number, height: number): ImageAnnotation['box'] | null {
  checkDimensions(pixels, width, height);

  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;

  pixels.forEach((v, i) => {
    if (!v) return;

    left = Math.min(left, i % width);
    right = Math.max(right, i % width);
    top = Math.min(top, Math.floor(i / width));
    bottom = Math.max(bottom, Math.floor(i / width));
  });

  return right < 0 ? null : [left, top, right - left + 1, bottom - top + 1];
}

export function maskPolygons(pixels: Uint8Array, width: number, height: number): number[][] {
  checkDimensions(pixels, width, height);

  return traceMaskPolygons(pixels, width, height);
}

export interface InstanceAnnotationInput {
  instanceIds: Uint32Array;
  width: number;
  height: number;
  instance: string;
  instanceId: number;
  classId: number;
  keypoints?: ImageKeypoint[];
}

export function annotationFromInstances(input: InstanceAnnotationInput): ImageAnnotation | null {
  checkDimensions(input.instanceIds, input.width, input.height);

  if (!Number.isInteger(input.instanceId) || input.instanceId < 1 || input.instanceId > 0xffffffff)
    throw new Error('Choose a foreground instance.');

  const pixels = Uint8Array.from(input.instanceIds, (v) => Number(v === input.instanceId));
  const box = maskBox(pixels, input.width, input.height);

  if (!box) return null;

  return {
    instance: input.instance,
    classId: input.classId,
    box,
    mask: encodeMask(pixels, input.width, input.height),
    polygons: maskPolygons(pixels, input.width, input.height),
    keypoints: input.keypoints ?? [],
  };
}
