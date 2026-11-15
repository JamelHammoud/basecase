import { describe, expect, it, vi } from 'vitest';
import { depthResize } from './depthResize';
import type { VisionManifest } from './manifest';
import { imageTransform, preprocess, type ImageTransform } from './preprocess';
import type { VisionPixels } from './types';

type Input = VisionManifest['input'];

function frameOf(seed: number): VisionPixels {
  const width = 14 + ((seed * 13) % 53);
  const height = 14 + ((seed * 17) % 47);
  const data = new Uint8ClampedArray(width * height * 4 + 6).subarray(3, -3);

  for (let i = 0; i < data.length; i++) data[i] = (i * (seed + 7) + (i >>> 3) * 13) % 256;

  return { width, height, data };
}

function inputOf(seed: number): Input {
  return {
    width: 56 + ((seed * 11) % 47),
    height: 56 + ((seed * 19) % 41),
    layout: 'nchw',
    mean: [0.485, -0.125, 1.2],
    std: [0.229, 0.75, 1.25],
    scale: [undefined, 1 / 255, 1, 0, -0.5][seed % 5],
  };
}

function referenceSample(frame: VisionPixels, pixel: { x: number; y: number; channel: number }) {
  const { x, y, channel } = pixel;
  const left = Math.max(0, Math.min(frame.width - 1, Math.floor(x)));
  const top = Math.max(0, Math.min(frame.height - 1, Math.floor(y)));
  const right = Math.min(frame.width - 1, left + 1);
  const bottom = Math.min(frame.height - 1, top + 1);
  const dx = Math.max(0, x - left);
  const dy = Math.max(0, y - top);
  const at = (x: number, y: number) => frame.data[(y * frame.width + x) * 4 + channel];

  return (
    at(left, top) * (1 - dx) * (1 - dy) +
    at(right, top) * dx * (1 - dy) +
    at(left, bottom) * (1 - dx) * dy +
    at(right, bottom) * dx * dy
  );
}

function referencePixel(frame: VisionPixels, transform: ImageTransform, pixel: number, channel: number) {
  const x = (pixel % transform.width) - transform.left;
  const y = Math.floor(pixel / transform.width) - transform.top;

  if (x < 0 || y < 0 || x >= transform.scaledWidth || y >= transform.scaledHeight) return 114;

  return referenceSample(frame, {
    x: ((x + 0.5) * frame.width) / transform.scaledWidth - 0.5,
    y: ((y + 0.5) * frame.height) / transform.scaledHeight - 0.5,
    channel,
  });
}

function referencePreprocess(frame: VisionPixels, input: Input) {
  const source = input.resize === 'aspect' ? depthResize(frame, input) : frame;
  const size = input.resize === 'aspect' ? { ...input, width: source.width, height: source.height } : input;
  const transform = imageTransform(source, size);
  const plane = size.width * size.height;
  const data = new Float32Array(plane * 3);

  for (let i = 0; i < data.length; i++) {
    const channel = Math.floor(i / plane);
    const value = referencePixel(source, transform, i % plane, input.color === 'bgr' ? 2 - channel : channel);

    data[i] = (value * (input.scale ?? 1 / 255) - input.mean[channel]) / input.std[channel];
  }

  return { data, dims: [1, 3, size.height, size.width], transform };
}

function expectReference(frame: VisionPixels, input: Input) {
  const expected = referencePreprocess(frame, input);
  const actual = preprocess(frame, input);

  expect(actual.dims).toEqual(expected.dims);
  expect(actual.transform).toEqual(expected.transform);
  expect(Buffer.from(actual.data.buffer).equals(Buffer.from(expected.data.buffer))).toBe(true);
}

describe('shared vision channel sampling', () => {
  it.each([undefined, 'stretch', 'letterbox', 'aspect'] as const)(
    'preserves complete %s tensors across colors, normalization and fractional scales',
    (resize) => {
      for (let seed = 0; seed < 40; seed++) {
        for (const color of [undefined, 'rgb', 'bgr'] as const)
          expectReference(frameOf(seed), { ...inputOf(seed), resize, color });
      }
    },
  );

  it('preserves single pixels, single rows, single columns and odd padding', () => {
    for (const [width, height] of [
      [1, 1],
      [1, 13],
      [13, 1],
      [3, 5],
      [5, 3],
    ]) {
      const frame = { width, height, data: frameOf(3).data.slice(0, width * height * 4) };

      for (const resize of ['stretch', 'letterbox'] as const)
        expectReference(frame, { ...inputOf(4), width: 7, height: 7, resize, color: 'bgr' });
    }
  });

  it('preserves inputs and owns output storage across edits and later calls', () => {
    const frame = frameOf(9);
    const original = frame.data.slice();
    const input = { ...inputOf(8), resize: 'letterbox' as const };
    const savedInput = structuredClone(input);
    const first = preprocess(frame, input);
    const saved = first.data.slice();

    expect(frame.data).toEqual(original);
    expect(input).toEqual(savedInput);
    frame.data.reverse();
    input.mean[1] = 23;
    expectReference(frame, input);
    expect(first.data).toEqual(saved);
    expect(preprocess(frame, input).data.buffer).not.toBe(first.data.buffer);
  });

  it.each([30, 60])('prepares spatial coordinates once per pixel at %s columns', (width) => {
    const frame = frameOf(4);
    const input = { ...inputOf(2), width, height: 20, resize: 'stretch' as const };
    const floors = vi.spyOn(Math, 'floor');

    preprocess(frame, input);

    const actual = floors.mock.calls.length;

    floors.mockClear();
    referencePreprocess(frame, input);

    const previous = floors.mock.calls.length;

    floors.mockRestore();
    expect(previous).toBe(width * input.height * 12 + 2);
    expect(actual).toBe(width * input.height * 3 + 2);
  });

  it('refuses malformed frames before sampling', () => {
    const frame = frameOf(1);

    for (const bad of [
      { ...frame, width: 0 },
      { ...frame, height: -1 },
      { ...frame, width: 1.5 },
      { ...frame, data: frame.data.subarray(1) },
      { ...frame, width: 16_777_217, height: 1 },
    ])
      expect(() => preprocess(bad, inputOf(1))).toThrow('dimensions');
  });
});
