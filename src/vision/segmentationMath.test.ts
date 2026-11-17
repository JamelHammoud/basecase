import { describe, expect, it } from 'vitest';
import { decodeMask } from './imageMasks';
import {
  segmentationPoints,
  segmentationMask,
  segmentationBank,
  segmentationSequence,
  segmentationPointers,
} from './segmentationMath';

const memory = (index: number) => ({
  index,
  tokens: new Float32Array(4096 * 64).fill(index),
  position: new Float32Array(4096 * 64).fill(index + 10),
  pointer: new Float32Array(256).fill(index + 20),
});

describe('SAM 2 prompt and mask coordinates', () => {
  it('maps source pixel prompts into the stretched model image', () => {
    expect(
      segmentationPoints(
        [
          { x: 80, y: 20, label: 1 },
          { x: 40, y: 10, label: 0 },
        ],
        160,
        80,
      ),
    ).toEqual({
      points: new Float32Array([512, 256, 256, 128]),
      labels: new Int32Array([1, 0]),
    });
  });

  it('refuses empty, out-of-bounds and non-finite prompts before inference', () => {
    for (const points of [[], [{ x: 10, y: 0, label: 1 }], [{ x: NaN, y: 0, label: 1 }], [{ x: 0, y: 0, label: 4 }]])
      expect(() => segmentationPoints(points, 10, 10)).toThrow();
  });

  it('resizes logits before thresholding and keeps COCO mask orientation', () => {
    const mask = segmentationMask({ data: new Float32Array([-1, 1, -1, 1]), dims: [1, 1, 2, 2] }, 4, 2);

    expect(mask.size).toEqual([2, 4]);
    expect([...decodeMask(mask)]).toEqual([0, 0, 1, 1, 0, 0, 1, 1]);
    expect(() => segmentationMask({ data: new Float32Array([NaN]), dims: [1, 1, 1, 1] }, 4, 2)).toThrow();
  });
});

describe('SAM 2 video memory', () => {
  it('transposes channel-first vision embeddings into sequence tokens', () => {
    expect([...segmentationSequence(new Float32Array([1, 2, 3, 4, 5, 6]), 2)]).toEqual([1, 3, 5, 2, 4, 6]);
  });

  it('retains conditioning memory, six recent masks and sixteen split object pointers', () => {
    const initial = memory(0);
    const recent = Array.from({ length: 20 }, (_, index) => memory(index + 1));
    const temporal = Array.from({ length: 7 }, (_, index) => new Array<number>(64).fill(index * 100));
    const bank = segmentationBank({
      initial,
      recent,
      frame: 21,
      temporal,
      pointerPosition: new Float32Array(16 * 64).fill(9),
    });

    expect(bank.memory).toHaveLength(28736 * 64);
    expect(bank.memory[0]).toBe(0);
    expect(bank.position[0]).toBe(610);
    expect(bank.memory[4096 * 64]).toBe(15);
    expect(bank.position[4096 * 64]).toBe(525);
    expect(bank.memory[6 * 4096 * 64]).toBe(20);
    expect(bank.position[6 * 4096 * 64]).toBe(30);
    expect(bank.memory[7 * 4096 * 64]).toBe(20);
    expect(bank.position.at(-1)).toBe(9);
  });

  it('pads the early memory bank with the newest available frame', () => {
    const initial = memory(0);
    const bank = segmentationBank({
      initial,
      recent: [],
      frame: 1,
      temporal: Array.from({ length: 7 }, () => new Array<number>(64).fill(0)),
      pointerPosition: new Float32Array(1024),
    });

    expect(bank.memory[4096 * 64]).toBe(0);
    expect(bank.memory.at(-1)).toBe(20);
  });
});

it.each([0, 1, 5, 6, 7, 14, 15, 16, 20])('preserves every memory slot with %i recent frames', (count) => {
  const initial = memory(0);
  const recent = Array.from({ length: count }, (_, index) => memory(index + 1));
  const saved = [...recent];
  const temporal = Array.from({ length: 7 }, (_, row) => Array.from({ length: 64 }, (_, column) => row * 100 + column));
  const pointerPosition = Float32Array.from({ length: 1024 }, (_, index) => index / 8);
  const bank = segmentationBank({ initial, recent, frame: count + 1, temporal, pointerPosition });
  const expectedMemory = new Float32Array(bank.memory.length);
  const expectedPosition = new Float32Array(bank.position.length);
  const spatial = recent.slice(-6);
  const latest = spatial.at(-1) ?? initial;
  const entries = [initial, ...Array.from({ length: 6 }, (_, index) => spatial[index] ?? latest)];
  const pointers = [initial, ...recent.slice(-15).reverse()];
  const padded = Array.from({ length: 16 }, (_, index) => pointers[Math.min(index, pointers.length - 1)]);

  entries.forEach((entry, slot) => {
    const offset = slot * 4096 * 64;
    const row = slot === 0 ? 6 : Math.min(5, count - entry.index);

    expectedMemory.set(entry.tokens, offset);

    for (let i = 0; i < entry.position.length; i++)
      expectedPosition[offset + i] = entry.position[i] + temporal[row][i % 64];
  });
  padded.forEach((entry, slot) => {
    const offset = 7 * 4096 * 64 + slot * 256;

    expectedMemory.set(entry.pointer, offset);

    for (let i = 0; i < 256; i++) expectedPosition[offset + i] = pointerPosition[slot * 64 + (i % 64)];
  });

  expect(Buffer.from(bank.memory.buffer).equals(Buffer.from(expectedMemory.buffer))).toBe(true);
  expect(Buffer.from(bank.position.buffer).equals(Buffer.from(expectedPosition.buffer))).toBe(true);

  const actualPointers = segmentationPointers(initial, recent);

  for (let i = 0; i < padded.length; i++) expect(actualPointers[i]).toBe(padded[i]);

  expect(recent).toEqual(saved);
  expect(segmentationPointers(initial, recent)).not.toBe(actualPointers);
});
