import { describe, expect, it } from 'vitest';
import { suppress } from './boxes';
import type { VisionDetection } from './types';

function referenceOverlap(a: VisionDetection, b: VisionDetection) {
  const [x, y, w, h] = a.box;
  const [bx, by, bw, bh] = b.box;
  const width = Math.max(0, Math.min(x + w, bx + bw) - Math.max(x, bx));
  const height = Math.max(0, Math.min(y + h, by + bh) - Math.max(y, by));
  const area = width * height;

  return area / Math.max(1e-12, w * h + bw * bh - area);
}

function reference(detections: VisionDetection[], threshold: number) {
  const sorted = detections
    .filter((item) => Number.isFinite(item.score) && item.box.every(Number.isFinite))
    .sort((a, b) => b.score - a.score);
  const kept: VisionDetection[] = [];

  for (const item of sorted) {
    if (kept.length >= 300) break;

    if (!kept.some((other) => other.label === item.label && referenceOverlap(other, item) > threshold)) kept.push(item);
  }

  return kept;
}

const detection = (label: string, score: number, box: VisionDetection['box'] = [0, 0, 1, 1]): VisionDetection => ({
  label,
  score,
  box,
});

function randomDetections(seed: number) {
  let state = seed;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;

    return state / 2 ** 32;
  };

  return Array.from({ length: 80 }, () =>
    detection(
      ['person', 'cat', 'face', '__proto__', 'constructor', ''][Math.floor(next() * 6)],
      Math.floor(next() * 5),
      [next() * 2 - 0.5, next() * 2 - 0.5, next() - 0.1, next() - 0.1],
    ),
  );
}

describe('detection suppression', () => {
  it('matches the complete retained order across mixed labels, score ties and thresholds', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const items = randomDetections(seed);
      const before = structuredClone(items);

      for (const threshold of [-1, 0, 0.3, 0.45, 1, NaN, Infinity]) {
        const expected = reference(items, threshold);
        const actual = suppress(items, threshold);

        expect(actual).toEqual(expected);
        actual.forEach((item, index) => expect(item).toBe(expected[index]));
      }

      expect(items).toEqual(before);
    }
  });

  it('uses strict overlap thresholds and retains only accepted peers', () => {
    const items = [
      detection('person', 1, [0, 0, 2, 1]),
      detection('cat', 1, [1, 0, 2, 1]),
      detection('person', 0.9, [1, 0, 2, 1]),
      detection('person', 0.8, [2, 0, 2, 1]),
    ];

    expect(suppress(items, 1 / 3)).toEqual(items);
    expect(suppress(items, 0.3)).toEqual([items[0], items[1], items[3]]);
    expect(suppress([items[0], items[0]], 1)).toEqual([items[0], items[0]]);
    expect(suppress([items[0], items[0]], 0.99)).toEqual([items[0]]);
  });

  it('rejects nonfinite detections while preserving finite degenerate boxes and attached data', () => {
    const keypoints: [number, number][] = [[0.2, 0.3]];
    const mask = { width: 1, height: 1, values: new Uint8Array([1]) };
    const items = [
      { ...detection('person', 1), keypoints, mask },
      detection('person', 0.9),
      detection('person', NaN),
      detection('person', Infinity),
      ...[0, 1, 2, 3].map((axis) => {
        const item = detection('cat', 0.8);

        item.box[axis] = axis % 2 ? NaN : Infinity;

        return item;
      }),
      detection('person', 0, [0, 0, 0, 0]),
      detection('person', -1, [-0, 0, -1, 1]),
    ];
    const actual = suppress(items);

    expect(actual).toEqual(reference(items, 0.45));
    expect(actual[0]).toBe(items[0]);
    expect(actual[0].keypoints).toBe(keypoints);
    expect(actual[0].mask).toBe(mask);
    expect(actual).toHaveLength(3);
    expect(suppress([])).toEqual([]);
  });

  it('caps the global score order at 300 and rebuilds label groups after edits', () => {
    const items = Array.from({ length: 650 }, (_, i) => detection(`class-${i}`, i % 17));
    const first = suppress(items);

    expect(first).toEqual(reference(items, 0.45));
    expect(first).toHaveLength(300);

    items.forEach((item) => {
      item.label = 'person';
    });
    items[0].score = 100;

    expect(suppress(items)).toEqual([items[0]]);
    expect(first).toHaveLength(300);
    expect(suppress(items, 1)).toEqual(reference(items, 1));
    expect(suppress(items, 1)).not.toBe(first);
  });

  it.each([300, 600])('reads each candidate label once across %i interleaved detections', (count) => {
    let reads = 0;
    const items = Array.from({ length: count }, (_, i) => ({
      ...detection('', 1),
      get label() {
        reads++;

        return `class-${i % 100}`;
      },
    }));
    const actual = suppress(items);

    expect(reads).toBe(count);
    expect(actual).toHaveLength(100);
    actual.forEach((item, index) => expect(item).toBe(items[index]));

    reads = 0;

    expect(reference(items, 0.45)).toEqual(actual);
    expect(reads).toBe(count * 101 - 200);
  });
});
