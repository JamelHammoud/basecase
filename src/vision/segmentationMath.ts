import { encodeMask } from './imageMasks';
import type { ImageMask } from './frameSet';

export interface SegmentationPoint {
  x: number;
  y: number;
  label: number;
}

export interface SegmentationMemory {
  index: number;
  tokens: Float32Array;
  position: Float32Array;
  pointer: Float32Array;
}

export function segmentationPoints(points: SegmentationPoint[], width: number, height: number) {
  if (
    !points.length ||
    points.length > 64 ||
    points.some(
      (p) =>
        !Number.isFinite(p.x) ||
        !Number.isFinite(p.y) ||
        p.x < 0 ||
        p.x >= width ||
        p.y < 0 ||
        p.y >= height ||
        ![0, 1].includes(p.label),
    ) ||
    !points.some((p) => p.label === 1)
  )
    throw new Error('Choose a foreground point inside the image.');

  return {
    points: Float32Array.from(points.flatMap((p) => [(p.x * 1024) / width, (p.y * 1024) / height])),
    labels: Int32Array.from(points.map((p) => p.label)),
  };
}

function maskValue(data: Float32Array, size: number[], x: number, y: number) {
  const [height, width] = size;
  const left = Math.max(0, Math.min(width - 1, Math.floor(x)));
  const top = Math.max(0, Math.min(height - 1, Math.floor(y)));
  const right = Math.min(width - 1, left + 1);
  const bottom = Math.min(height - 1, top + 1);
  const dx = Math.max(0, x - left);
  const dy = Math.max(0, y - top);

  return (
    data[top * width + left] * (1 - dx) * (1 - dy) +
    data[top * width + right] * dx * (1 - dy) +
    data[bottom * width + left] * (1 - dx) * dy +
    data[bottom * width + right] * dx * dy
  );
}

export function segmentationMask(
  tensor: { data: Float32Array; dims: readonly number[] },
  width: number,
  height: number,
): ImageMask {
  const [h, w] = tensor.dims.slice(-2);

  if (
    !h ||
    !w ||
    tensor.data.length !== h * w ||
    !tensor.data.every(Number.isFinite) ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height > 16777216
  )
    throw new Error('The segmentation model returned an unsupported mask.');

  const pixels = new Uint8Array(width * height);

  for (let i = 0; i < pixels.length; i++)
    pixels[i] = Number(
      maskValue(
        tensor.data,
        [h, w],
        (((i % width) + 0.5) * w) / width - 0.5,
        ((Math.floor(i / width) + 0.5) * h) / height - 0.5,
      ) > 0,
    );

  return encodeMask(pixels, width, height);
}

export function segmentationSequence(input: Float32Array, plane = 4096) {
  const channels = input.length / plane;
  const result = new Float32Array(input.length);

  for (let i = 0; i < input.length; i++) result[(i % plane) * channels + Math.floor(i / plane)] = input[i];

  return result;
}

export function segmentationPointers(initial: SegmentationMemory, recent: SegmentationMemory[]) {
  const values = [initial, ...recent.slice(-15).reverse()];

  return Array.from({ length: 16 }, (_, index) => values[Math.min(index, values.length - 1)]);
}

interface BankInput {
  initial: SegmentationMemory;
  recent: SegmentationMemory[];
  frame: number;
  temporal: number[][];
  pointerPosition: Float32Array;
}

export function segmentationBank(input: BankInput) {
  const { initial, recent, frame, temporal, pointerPosition } = input;
  const spatial = recent.slice(-6);
  const latest = spatial.at(-1) ?? initial;
  const entries = [initial, ...Array.from({ length: 6 }, (_, index) => spatial[index] ?? latest)];
  const memory = new Float32Array(28736 * 64);
  const position = new Float32Array(memory.length);

  entries.forEach((entry, index) => {
    const row = index === 0 ? 6 : Math.min(5, frame - entry.index - 1);
    const offset = index * 4096 * 64;

    memory.set(entry.tokens, offset);

    for (let i = 0; i < entry.position.length; i++) position[offset + i] = entry.position[i] + temporal[row][i % 64];
  });
  segmentationPointers(initial, recent).forEach((entry, index) => {
    const offset = 7 * 4096 * 64 + index * 256;

    memory.set(entry.pointer, offset);

    for (let i = 0; i < 256; i++) position[offset + i] = pointerPosition[index * 64 + (i % 64)];
  });

  return { memory, position };
}
