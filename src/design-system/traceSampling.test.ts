import { describe, expect, it } from 'vitest';
import { tracePaths, type Range, type TraceBox } from './tracePaths';

const BOX: TraceBox = { width: 4, height: 50, inset: 5 };
const RANGE: Range = [-10, 10];

function referencePoints(values: ArrayLike<number>, columns: number): number[] {
  const samples = Array.from(values, (value, index) => ({ value, index }));

  if (values.length <= columns * 2) return samples.map(({ index }) => index);

  const per = values.length / columns;

  return Array.from({ length: columns }, (_, column) => {
    const bucket = samples
      .slice(Math.floor(column * per), Math.floor((column + 1) * per))
      .filter(({ value }) => Number.isFinite(value));

    if (!bucket.length) return [-1];

    const low = bucket.reduce((best, sample) => (sample.value < best.value ? sample : best));
    const high = bucket.reduce((best, sample) => (sample.value > best.value ? sample : best));

    return low.index === high.index ? [low.index] : [low.index, high.index].sort((a, b) => a - b);
  }).flat();
}

function referencePath(values: ArrayLike<number>, box: TraceBox): string {
  let pen = 'M';
  const parts: string[] = [];

  for (const index of referencePoints(values, box.width)) {
    const value = index < 0 ? Number.NaN : values[index];

    if (!Number.isFinite(value)) {
      pen = 'M';

      continue;
    }

    const x = (index / Math.max(values.length - 1, 1)) * box.width;
    const y = box.inset + (1 - (value - RANGE[0]) / (RANGE[1] - RANGE[0])) * (box.height - 2 * box.inset);

    parts.push(`${pen}${x.toFixed(1)} ${y.toFixed(1)}`);
    pen = 'L';
  }

  return parts.join('');
}

const path = (values: ArrayLike<number>, box = BOX) =>
  tracePaths([{ id: 'recording', tone: 'accent', values }], box, RANGE)[0].d;

describe('trace sampling', () => {
  it('keeps temporal extrema order, first ties, flat buckets and missing-column gaps', () => {
    const values = [8, -7, -7, 8, Number.NaN, Infinity, -Infinity, Number.NaN, 3, 3, 3, 3, -2, 9, -2, 9];

    expect(path(values)).toBe('M0.0 9.0L0.3 39.0M2.1 19.0L3.2 29.0L3.5 7.0');
    expect(path(values)).toBe(referencePath(values, BOX));
    expect(path(Array(16).fill(Number.NaN))).toBe('');
    expect(path(Array(16).fill(2)).match(/[ML]/g)).toHaveLength(4);
  });

  it('matches complete paths at the reduction boundary and across uneven and fractional buckets', () => {
    for (const width of [1, 2, 3.5, 4, 7, 1000]) {
      const box = { ...BOX, width };

      for (const length of [0, 1, Math.floor(width * 2), Math.floor(width * 2) + 1, 101, 6001]) {
        const values = Object.freeze(
          Array.from({ length }, (_, i) => {
            if (i % 13 === 4) return Number.NaN;

            if (i % 17 === 6) return Infinity;

            return Math.round(Math.sin(i * 0.73) * 8);
          }),
        );

        expect(path(values, box)).toBe(referencePath(values, box));
      }
    }
  });

  it('reads typed-array views afresh without changing inputs or earlier results', () => {
    const storage = Float64Array.from({ length: 103 }, (_, i) => Math.cos(i) * 9);
    const values = storage.subarray(1, 102);
    const before = storage.slice();
    const first = path(values);

    expect(first).toBe(referencePath(values, BOX));
    expect(storage).toEqual(before);

    values.fill(-4, 20, 50);
    values[60] = Number.NaN;
    values[61] = 10;

    const edited = storage.slice();
    const changed = path(values);

    expect(changed).toBe(referencePath(values, BOX));
    expect(changed).not.toBe(first);
    expect(path(before.subarray(1, 102))).toBe(first);
    expect(storage).toEqual(edited);
  });

  it('reads each reduced sample once, including missing values and tied extrema', () => {
    const source = Array.from({ length: 6001 }, (_, i) => {
      if (i % 13 === 0) return Number.NaN;

      if (i % 17 === 0) return Infinity;

      return Math.round(Math.sin(i) * 8);
    });
    const reads = new Uint32Array(source.length);
    const values = { length: source.length };

    for (let i = 0; i < source.length; i++) {
      Object.defineProperty(values, i, {
        get() {
          reads[i]++;

          return source[i];
        },
      });
    }

    expect(path(values as ArrayLike<number>)).toBe(referencePath(source, BOX));
    expect(reads).toEqual(new Uint32Array(source.length).fill(1));
  });
});
