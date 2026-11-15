import { describe, expect, it, vi } from 'vitest';
import { pairKey } from './pairKey.mjs';
import { edgeKey } from './replicadEdges.mjs';

const sortedKey = (a, b, separator = '|') => [a, b].sort().join(separator);

describe('unordered string pair keys', () => {
  it('preserves sorted keys in either direction across separators and UTF-16 boundaries', () => {
    const values = [
      '',
      'a',
      'aa',
      'A',
      '10',
      '2',
      '-1,0,2',
      'a|b',
      '\n',
      '\0',
      'é',
      'é',
      '🤖',
      '\ud800',
      '\udfff',
      '\uffff',
    ];
    const separators = [undefined, '|', '+', '\n', '\0', '', '::'];

    for (const separator of separators) {
      for (const a of values) {
        for (const b of values) {
          expect(pairKey(a, b, separator)).toBe(sortedKey(a, b, separator));
          expect(pairKey(a, b, separator)).toBe(pairKey(b, a, separator));
        }
      }
    }
  });

  it('matches sorted keys for generated strings without retaining prior calls', () => {
    let seed = 319;
    const word = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;

      return String.fromCharCode(seed & 65535, seed >>> 16);
    };

    for (let i = 0; i < 2000; i++) {
      const a = word();
      const b = word();
      const separator = word();

      expect(pairKey(a, b, separator)).toBe(sortedKey(a, b, separator));
    }

    expect(pairKey('changed', 'source')).toBe('changed|source');
    expect(pairKey('a', 'a')).toBe('a|a');
  });

  it.each([300, 600])('constructs %i keys without sorting temporary pairs', (count) => {
    const pairs = Array.from({ length: count }, (_, i) => [`part-${i}`, `part-${count - i}`]);
    const expected = pairs.map(([a, b]) => sortedKey(a, b));
    const sort = vi.spyOn(Array.prototype, 'sort');
    let actual;
    let calls;

    try {
      actual = pairs.map(([a, b]) => pairKey(a, b));
      calls = sort.mock.calls.length;
    } finally {
      sort.mockRestore();
    }

    expect(actual).toEqual(expected);
    expect(calls).toBe(0);
  });

  it('preserves CAD edge rounding, direction independence and curved-edge midpoints', () => {
    const pointKey = (p) => [p.x, p.y, p.z].map((v) => Math.round(v * 50)).join(',');
    const startPoint = { x: -1.01, y: 2.009, z: 10 };
    const endPoint = { x: 2.01, y: -0.009, z: 1 };
    const middle = { x: 0.4, y: 3.005, z: 2 };
    const pointAt = vi.fn(() => middle);
    const edge = { startPoint, endPoint, pointAt };
    const expected = `${sortedKey(pointKey(startPoint), pointKey(endPoint))}|${pointKey(middle)}`;

    expect(edgeKey(edge)).toBe(expected);
    expect(edgeKey({ startPoint: endPoint, endPoint: startPoint, pointAt })).toBe(expected);
    expect(pointAt.mock.calls).toEqual([[0.5], [0.5]]);
    middle.y += 1;
    expect(edgeKey(edge)).not.toBe(expected);
    expect(startPoint).toEqual({ x: -1.01, y: 2.009, z: 10 });
    expect(endPoint).toEqual({ x: 2.01, y: -0.009, z: 1 });
  });
});
