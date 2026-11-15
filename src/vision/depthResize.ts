import type { VisionPixels } from './types';

interface Dimensions {
  width: number;
  height: number;
}

interface Kernel {
  start: number;
  weights: number[];
}

const PRECISION = 2 ** 22;
const cubic = (value: number) => {
  const x = Math.abs(value);

  if (x < 1) return (1.5 * x - 2.5) * x * x + 1;

  if (x < 2) return (((x - 5) * x + 8) * x - 4) * -0.5;

  return 0;
};
const evenRound = (value: number) => {
  const lower = Math.floor(value);

  return value - lower === 0.5 ? lower + (lower % 2) : Math.round(value);
};

export function depthDimensions(frame: Dimensions, target: Dimensions): Dimensions {
  if (
    ![frame.width, frame.height, target.width, target.height].every((size) => Number.isInteger(size) && size > 0) ||
    frame.width * frame.height > 16777216
  )
    throw new Error('The depth image has unsupported dimensions.');

  const sw = target.width / frame.width;
  const sh = target.height / frame.height;
  const scale = Math.abs(1 - sw) < Math.abs(1 - sh) ? sw : sh;
  const width = evenRound((frame.width * scale) / 14) * 14;
  const height = evenRound((frame.height * scale) / 14) * 14;

  if (![width, height].every((size) => Number.isInteger(size) && size >= 14 && size <= 2048))
    throw new Error('The depth image exceeds the model dimensions.');

  return { width, height };
}

function kernels(source: number, target: number): Kernel[] {
  const scale = source / target;
  const filterScale = Math.max(1, scale);
  const support = 2 * filterScale;

  return Array.from({ length: target }, (_, index) => {
    const center = (index + 0.5) * scale;
    const start = Math.max(0, Math.trunc(center - support + 0.5));
    const end = Math.min(source, Math.trunc(center + support + 0.5));
    const weights = Array.from({ length: end - start }, (_, offset) =>
      cubic((offset + start - center + 0.5) / filterScale),
    );
    const total = weights.reduce((sum, weight) => sum + weight, 0);

    return {
      start,
      weights: weights.map((weight) => Math.trunc((weight / total) * PRECISION + (weight < 0 ? -0.5 : 0.5))),
    };
  });
}

function resizeAxis(frame: VisionPixels, size: number, horizontal: boolean): VisionPixels {
  const width = horizontal ? size : frame.width;
  const height = horizontal ? frame.height : size;
  const coefficients = kernels(horizontal ? frame.width : frame.height, size);
  const data = new Uint8ClampedArray(width * height * 4);

  for (let index = 0; index < data.length; index++) {
    const channel = index % 4;
    const x = Math.floor(index / 4) % width;
    const y = Math.floor(index / (4 * width));
    const kernel = coefficients[horizontal ? x : y];
    let sum = PRECISION / 2;

    for (let offset = 0; offset < kernel.weights.length; offset++) {
      const sourceX = horizontal ? kernel.start + offset : x;
      const sourceY = horizontal ? y : kernel.start + offset;

      sum += frame.data[(sourceY * frame.width + sourceX) * 4 + channel] * kernel.weights[offset];
    }

    data[index] = Math.max(0, Math.min(255, Math.floor(sum / PRECISION)));
  }

  return { width, height, data };
}

export function depthResize(frame: VisionPixels, target: Dimensions): VisionPixels {
  if (frame.data.length !== frame.width * frame.height * 4) throw new Error('The depth image has unsupported pixels.');

  const { width, height } = depthDimensions(frame, target);
  const horizontal = width === frame.width ? frame : resizeAxis(frame, width, true);

  return height === frame.height ? horizontal : resizeAxis(horizontal, height, false);
}
