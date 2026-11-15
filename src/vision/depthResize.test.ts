import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { depthDimensions, depthResize } from './depthResize';

function patternedFrame(width: number, height: number) {
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      data.set([(x * 17 + y * 13) % 256, (x * 5 + y * 31) % 256, (x * 43 + y * 7) % 256, 255], (y * width + x) * 4);
    }
  }

  return { width, height, data };
}

function generatedFrame(seed: number) {
  const width = 14 + ((seed * 13) % 67);
  const height = 14 + ((seed * 17) % 61);
  const data = new Uint8ClampedArray(width * height * 4 + 10).subarray(5, -5);

  for (let i = 0; i < data.length; i++) data[i] = (i * (seed + 11) + (i >>> 2) * 19) % 256;

  return { width, height, data };
}

describe('Depth Anything image resize', () => {
  it('follows DPT minimal scale and patch dimensions for camera frames', () => {
    const target = { width: 518, height: 518 };

    expect(depthDimensions({ width: 640, height: 480 }, target)).toEqual({ width: 686, height: 518 });
    expect(depthDimensions({ width: 810, height: 1080 }, target)).toEqual({ width: 518, height: 686 });
    expect(depthDimensions({ width: 1000, height: 500 }, target)).toEqual({ width: 1036, height: 518 });
    expect(() => depthDimensions({ width: 10000, height: 1 }, target)).toThrow('dimensions');
    expect(depthDimensions({ width: 28, height: 35 }, { width: 28, height: 28 })).toEqual({ width: 28, height: 28 });
    expect(depthDimensions({ width: 28, height: 49 }, { width: 28, height: 28 })).toEqual({ width: 28, height: 56 });
  });

  it.each([
    {
      source: [17, 23],
      target: 56,
      output: [42, 56],
      hash: '297f7e916c5ab619d0c3cd91ec619e910be3aba7b8b2ba7ca4ed1f0d3e09a586',
    },
    {
      source: [17, 23],
      target: 28,
      output: [14, 28],
      hash: 'ee65674af51848c57edaa07086753bdbb85fa6932e044e9434e5ccf8e205779e',
    },
    {
      source: [64, 48],
      target: 28,
      output: [42, 28],
      hash: '862f32c4802792339fc7cb46982632d95c13028eb13a48fa61091d7f69d79a0b',
    },
  ])('matches Pillow bicubic pixels for $source at target $target', ({ source, target, output, hash }) => {
    const resized = depthResize(patternedFrame(source[0], source[1]), { width: target, height: target });

    expect([resized.width, resized.height]).toEqual(output);
    expect(createHash('sha256').update(resized.data).digest('hex')).toBe(hash);
  });

  it('rejects malformed input before allocating image data', () => {
    const target = { width: 518, height: 518 };

    expect(() => depthDimensions({ width: -14, height: -14 }, target)).toThrow('dimensions');
    expect(() => depthDimensions({ width: 0, height: 480 }, target)).toThrow('dimensions');
    expect(() => depthDimensions({ width: 640.5, height: 480 }, target)).toThrow('dimensions');
    expect(() => depthResize({ width: 640, height: 480, data: new Uint8ClampedArray(0) }, target)).toThrow('pixels');
  });

  it('keeps an already sized image without copying pixels', () => {
    const frame = patternedFrame(28, 42);

    expect(depthResize(frame, { width: 28, height: 28 })).toBe(frame);
  });

  it('preserves every RGBA byte across 160 generated resizes', () => {
    const hash = createHash('sha256');

    for (let seed = 0; seed < 160; seed++) {
      const frame = generatedFrame(seed);
      const original = frame.data.slice();
      const resized = depthResize(frame, { width: 56 + ((seed * 11) % 61), height: 56 + ((seed * 19) % 53) });

      expect(Buffer.from(frame.data).equals(Buffer.from(original))).toBe(true);
      hash.update(Buffer.from([resized.width, resized.height]));
      hash.update(resized.data);
    }

    expect(hash.digest('hex')).toBe('81e829a1719fad7399b94f4941ec0b92d7a93b5d3089f12dc65fe315bc4926af');
  });

  it.each([
    [28, 49],
    [49, 28],
    [70, 56],
  ])('keeps independent buffers for %s by %s frames and later edits', (width, height) => {
    const frame = { width, height, data: generatedFrame(10).data.slice(0, width * height * 4) };
    const target = { width: 28, height: 28 };
    const first = depthResize(frame, target);
    const saved = first.data.slice();

    frame.data.reverse();

    const next = depthResize(frame, target);

    expect(first.data).toEqual(saved);
    expect(next.data.buffer).not.toBe(first.data.buffer);
    expect(next.data).not.toEqual(first.data);
  });

  it.each([30, 60])('shares kernel coordinates across four channels at target %s', (size) => {
    const frame = patternedFrame(28, 35);
    const target = { width: size, height: size };
    const output = depthDimensions(frame, target);
    const horizontalPixels = output.width === frame.width ? 0 : output.width * frame.height;
    const verticalPixels = output.height === frame.height ? 0 : output.width * output.height;
    const floors = vi.spyOn(Math, 'floor');

    depthResize(frame, target);

    const count = floors.mock.calls.length;

    floors.mockRestore();
    expect(count).toBe(6 * (horizontalPixels + verticalPixels) + 2);
  });
});
