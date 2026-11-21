import { encodeMask } from './imageMasks';
import type { ImageMask } from './frameSet';
import { bilinearMaskPixels } from './maskSampling';

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

  const pixels = bilinearMaskPixels(tensor.data, { width: w, height: h }, { width, height });

  return encodeMask(pixels, width, height);
}

export function segmentationSequence(input: Float32Array, plane = 4096) {
  const channels = input.length / plane;
  const result = new Float32Array(input.length);

  for (let i = 0; i < input.length; i++) result[(i % plane) * channels + Math.floor(i / plane)] = input[i];

  return result;
}

function segmentationPointer(initial: SegmentationMemory, recent: SegmentationMemory[], index: number) {
  const count = Math.min(15, recent.length);

  return index === 0 || count === 0 ? initial : recent[recent.length - Math.min(index, count)];
}

export function segmentationPointers(initial: SegmentationMemory, recent: SegmentationMemory[]) {
  return Array.from({ length: 16 }, (_, index) => segmentationPointer(initial, recent, index));
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
  const start = Math.max(0, recent.length - 6);
  const latest = recent.at(-1) ?? initial;
  const memory = new Float32Array(28736 * 64);
  const position = new Float32Array(memory.length);

  for (let index = 0; index < 7; index++) {
    const entry = index === 0 ? initial : (recent[start + index - 1] ?? latest);
    const row = index === 0 ? 6 : Math.min(5, frame - entry.index - 1);
    const offset = index * 4096 * 64;

    memory.set(entry.tokens, offset);

    for (let i = 0; i < entry.position.length; i++) position[offset + i] = entry.position[i] + temporal[row][i % 64];
  }

  for (let index = 0; index < 16; index++) {
    const entry = segmentationPointer(initial, recent, index);
    const offset = 7 * 4096 * 64 + index * 256;

    memory.set(entry.pointer, offset);

    for (let i = 0; i < 256; i++) position[offset + i] = pointerPosition[index * 64 + (i % 64)];
  }

  return { memory, position };
}
