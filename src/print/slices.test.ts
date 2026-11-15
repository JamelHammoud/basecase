import { describe, expect, it } from 'vitest';
import type { SlicedPlate } from './printBridge';
import { currentSlices, sliceLookup } from './slices';

const timed = (hash: string | null, number: number, seconds: number): SlicedPlate => ({
  hash,
  number,
  seconds,
  local: number,
  material: 'PLA',
  grams: 10,
  support: false,
  warnings: [],
  thumbnail: null,
});
const usable = (slice: { seconds: number }) => Number.isFinite(slice.seconds) && slice.seconds >= 0;

describe('slice lookups', () => {
  it('keeps the first matching slice under each caller’s duration rules', () => {
    const slices = Object.freeze(
      [
        timed('a', 1, NaN),
        timed('a', 1, -1),
        timed('a', 1, Infinity),
        timed('a', 1, 0),
        timed('a', 1, 3600),
        timed('b', 1, 7200),
        timed('a', 2, 1800),
        timed('a|1', 2, 90),
        timed('', -0, 10),
        timed('a', NaN, 1),
        timed('a', Infinity, 2),
        timed(null, 1, 3),
      ].map((slice) => Object.freeze(slice)),
    );
    const queries = [...slices, timed('absent', 1, 0), timed('a', 3, 0)];

    for (const accepts of [undefined, usable]) {
      const lookup = sliceLookup(slices, accepts);

      for (const plate of queries) {
        const expected = slices.find(
          (s) => s.hash === plate.hash && s.number === plate.number && (!accepts || accepts(s)),
        );

        expect(lookup(plate)).toBe(expected);
      }
    }
  });

  it('rebuilds after slice replacement and rejects stale label keys', () => {
    const first = timed('plate', 1, 60);
    const record = { labels: 'letters-a', plates: [first] };
    const before = sliceLookup(currentSlices(record, 'letters-a'));

    record.plates = [timed('plate', 1, 120)];

    expect(before(first)).toBe(first);
    expect(sliceLookup(currentSlices(record, 'letters-a'))(first)).toBe(record.plates[0]);
    expect(sliceLookup(currentSlices(record, 'letters-b'))(first)).toBeUndefined();
    expect(sliceLookup(currentSlices(null, ''))(first)).toBeUndefined();
    expect(sliceLookup(currentSlices({ plates: [first] }, ''))(first)).toBe(first);
    expect(sliceLookup([])(first)).toBeUndefined();
  });

  it.each([300, 600])('reads each saved plate number once for %i plate queries', (count) => {
    let reads = 0;
    const slices = Array.from({ length: count }, (_, number) => ({
      hash: 'shared-material',
      get number() {
        reads++;

        return number;
      },
      seconds: number * 60,
    }));
    const lookup = sliceLookup(slices);

    for (let number = count - 1; number >= 0; number--) {
      expect(lookup({ hash: 'shared-material', number })).toBe(slices[number]);
    }

    expect(reads).toBe(count);

    reads = 0;

    for (let number = count - 1; number >= 0; number--) {
      expect(slices.find((slice) => slice.number === number)).toBe(slices[number]);
    }

    expect(reads).toBe((count * (count + 1)) / 2);
  });
});
