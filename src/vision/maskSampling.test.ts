import { describe, expect, it, vi } from 'vitest';
import type { TrainingFrame } from './frameSet';
import { decodeMask, encodeMask } from './imageMasks';
import { labelGeometry } from './labelEdits';
import { bilinearMaskPixels, nearestMaskColumns } from './maskSampling';
import { prelabelFrameLabels } from './prelabelsGeometry';
import { segmentationMask } from './segmentationMath';
import { maskOverlap } from './training/metricsGeometry';
import type { VisionDetection } from './types';

interface Size {
  width: number;
  height: number;
}

function previousBilinear(data: Float32Array, source: Size, target: Size): Uint8Array {
  return Uint8Array.from({ length: target.width * target.height }, (_, i) => {
    const x = (((i % target.width) + 0.5) * source.width) / target.width - 0.5;
    const y = ((Math.floor(i / target.width) + 0.5) * source.height) / target.height - 0.5;
    const left = Math.max(0, Math.min(source.width - 1, Math.floor(x)));
    const top = Math.max(0, Math.min(source.height - 1, Math.floor(y)));
    const right = Math.min(source.width - 1, left + 1);
    const bottom = Math.min(source.height - 1, top + 1);
    const dx = Math.max(0, x - left);
    const dy = Math.max(0, y - top);

    return Number(
      data[top * source.width + left] * (1 - dx) * (1 - dy) +
        data[top * source.width + right] * dx * (1 - dy) +
        data[bottom * source.width + left] * (1 - dx) * dy +
        data[bottom * source.width + right] * dx * dy >
        0,
    );
  });
}

function previousNearest(mask: NonNullable<VisionDetection['mask']>, target: Size): Uint8Array {
  const pixels = new Uint8Array(target.width * target.height);

  for (let y = 0; y < target.height; y++) {
    const py = Math.min(mask.height - 1, Math.floor(((y + 0.5) * mask.height) / target.height));

    for (let x = 0; x < target.width; x++) {
      const px = Math.min(mask.width - 1, Math.floor(((x + 0.5) * mask.width) / target.width));

      pixels[y * target.width + x] = Number(mask.values[py * mask.width + px] !== 0);
    }
  }

  return pixels;
}

const frameFor = (size: Size): TrainingFrame => ({
  ...size,
  id: 'frame',
  seed: 0,
  camera: 'Scene',
  jpeg: new Uint8Array([255, 216, 255, 217]),
  depth: new Float32Array(size.width * size.height),
  annotations: [],
});

function fixture(index: number) {
  const source = { width: 1 + (index % 13), height: 1 + ((index * 7) % 17) };
  const target = { width: 1 + ((index * 11) % 31), height: 1 + ((index * 19) % 29) };
  const data = Float32Array.from(
    { length: source.width * source.height },
    (_, i) => Math.sin(i * 5 + index) * (index % 2 ? 1e-20 : 17),
  );

  return { source, target, data };
}

function roundingCount(run: () => unknown): number {
  const floor = Math.floor;
  const measured = Object.create(Math) as Math;
  let count = 0;

  measured.floor = (value) => {
    count++;

    return floor(value);
  };
  vi.stubGlobal('Math', measured);

  try {
    run();

    return count;
  } finally {
    vi.unstubAllGlobals();
  }
}

function checkNearest(index: number) {
  const { source, target, data } = fixture(index);
  const mask = { ...source, values: Uint8Array.from(data, (value) => (value > 0 ? 255 : 0)) };
  const detection: VisionDetection = { label: 'Cup', score: 1, box: [0, 0, 1, 1], mask };
  const pixels = previousNearest(mask, target);
  const frame = frameFor(target);
  const labels = prelabelFrameLabels({
    frame,
    classes: [],
    result: { ...target, modelId: 'test', timestamp: 0, detections: [detection] },
  });
  const expected = pixels.some(Boolean)
    ? [
        {
          ...labelGeometry({ ...target, pixels, classId: 0, instance: 'model_0' }),
          source: 'model',
          review: 'suggested',
        },
      ]
    : [];

  expect(labels.annotations).toEqual(expected);

  const truth = Uint8Array.from(pixels, (_, i) => Number((i + index) % 3 === 0));
  const annotation = { ...labelGeometry({ ...target, pixels: truth, classId: 0, instance: 'truth' }) };
  let intersection = 0;
  let union = 0;

  for (let i = 0; i < truth.length; i++) {
    intersection += Number(Boolean(truth[i] && pixels[i]));
    union += Number(Boolean(truth[i] || pixels[i]));
  }

  expect(maskOverlap(annotation, detection, frame)).toBe(union ? intersection / union : 0);
  expect(mask.values).toEqual(Uint8Array.from(data, (value) => (value > 0 ? 255 : 0)));
}

describe('prepared mask sampling axes', () => {
  it('preserves complete model suggestions and overlap scores across mixed resize ratios', () => {
    for (let index = 0; index < 100; index++) checkNearest(index);
  });

  it('preserves complete SAM masks, threshold ties, views and edits', () => {
    for (let index = 0; index < 160; index++) {
      const { source, target, data } = fixture(index);
      const storage = new Float32Array(data.length + 4);
      const view = storage.subarray(2, data.length + 2);

      view.set(data);

      const before = storage.slice();
      const expected = previousBilinear(view, source, target);
      const actual = segmentationMask(
        { data: view, dims: [1, 1, source.height, source.width] },
        target.width,
        target.height,
      );

      expect(actual).toEqual(encodeMask(expected, target.width, target.height));
      expect(storage).toEqual(before);
      view.reverse();
      expect(bilinearMaskPixels(view, source, target)).toEqual(previousBilinear(view, source, target));
      expect(decodeMask(actual)).toEqual(expected);
    }

    const data = new Float32Array([-1, 1, 0, -0]);

    expect(bilinearMaskPixels(data, { width: 2, height: 2 }, { width: 3, height: 3 })).toEqual(
      previousBilinear(data, { width: 2, height: 2 }, { width: 3, height: 3 }),
    );
  });

  it('keeps sampling buffers independent across calls and dimension changes', () => {
    const first = nearestMaskColumns(7, 19);
    const saved = first.slice();
    const next = nearestMaskColumns(3, 19);

    next.fill(99);
    expect(first).toEqual(saved);
    expect(nearestMaskColumns(7, 19)).toEqual(saved);

    const data = new Float32Array([-1, 1, 1, -1]);
    const size = { width: 2, height: 2 };
    const pixels = bilinearMaskPixels(data, size, size);

    data.fill(1);
    expect(bilinearMaskPixels(data, size, size)).toEqual(new Uint8Array(4).fill(1));
    expect(pixels).toEqual(new Uint8Array([0, 1, 1, 0]));
  });

  it('preserves wide and tall masks across bounded column blocks', () => {
    const source = { width: 3, height: 2 };
    const data = new Float32Array([-1, 0, 1, 2, -3, 4]);

    for (const target of [
      { width: 8193, height: 2 },
      { width: 1, height: 8193 },
    ])
      expect(bilinearMaskPixels(data, source, target)).toEqual(previousBilinear(data, source, target));
  });

  it.each([300, 600])('rounds each axis coordinate once for a %i-pixel square', (size) => {
    const target = { width: size, height: size };
    const source = { width: 2, height: 2 };
    const data = new Float32Array([1, -1, -1, 1]);
    const mask = { ...source, values: new Uint8Array([1, 0, 0, 1]) };

    expect(roundingCount(() => previousNearest(mask, target))).toBe(size * size + size);
    expect(roundingCount(() => nearestMaskColumns(source.width, size))).toBe(size);
    expect(roundingCount(() => previousBilinear(data, source, target))).toBe(3 * size * size);
    expect(roundingCount(() => bilinearMaskPixels(data, source, target))).toBe(2 * size);
  });
});
