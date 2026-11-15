import { describe, expect, it } from 'vitest';
import { boundaryClearance, type LabelBox } from './labelBoundary';
import { fitLabel, labelBox } from './labelFit';
import { textWidth } from './labelFont';
import type { FlatFace } from './labelFaces';

function intersects(edge: number[], box: LabelBox): boolean {
  let start = 0;
  let end = 1;

  for (const [a, b, low, high] of [
    [edge[0], edge[2], box.minX, box.maxX],
    [edge[1], edge[3], box.minY, box.maxY],
  ]) {
    if (a === b && (a < low || a > high)) return false;

    if (a === b) continue;

    const crossings = [(low - a) / (b - a), (high - a) / (b - a)].sort((x, y) => x - y);

    start = Math.max(start, crossings[0]);
    end = Math.min(end, crossings[1]);
  }

  return start <= end;
}

const box = (x: number, y: number, w: number, h: number): LabelBox => ({
  minX: x,
  minY: y,
  maxX: x + w,
  maxY: y + h,
});

function face(edges: Float32Array): FlatFace {
  return {
    normal: [0, 0, 1],
    offset: 0,
    area: 240,
    u: [1, 0, 0],
    v: [0, 1, 0],
    centroid: [10, 6],
    tris: new Float32Array([0, 0, 20, 0, 20, 12, 0, 0, 20, 12, 0, 12]),
    edges,
  };
}

function rectangularBoundary(count: number): Float32Array {
  const corners = [
    [0, 0, 20, 0],
    [20, 0, 20, 12],
    [20, 12, 0, 12],
    [0, 12, 0, 0],
  ];

  return Float32Array.from(
    corners.flatMap(([x, y, endX, endY]) =>
      Array.from({ length: count / 4 }, (_, i) => [
        x + ((endX - x) * i) / (count / 4),
        y + ((endY - y) * i) / (count / 4),
        x + ((endX - x) * (i + 1)) / (count / 4),
        y + ((endY - y) * (i + 1)) / (count / 4),
      ]).flat(),
    ),
  );
}

describe('prepared printed-label boundaries', () => {
  it('matches independent segment intervals across generated boxes and edge directions', () => {
    let seed = 17;
    const next = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;

      return (seed % 801) / 8 - 50;
    };

    for (let n = 0; n < 200; n++) {
      const edges = Float32Array.from({ length: 24 }, next);
      const clear = boundaryClearance(edges);

      for (let k = 0; k < 30; k++) {
        const bounds = box(next(), next(), Math.abs(next()), Math.abs(next()));
        const hit = Array.from({ length: 6 }, (_, i) => intersects(Array.from(edges.slice(i * 4, i * 4 + 4)), bounds));

        expect(clear(bounds)).toBe(!hit.some(Boolean));
      }
    }
  });

  it.each([
    [0, 0, 0, 0],
    [-2, 0, 2, 0],
    [0, -2, 0, 2],
    [-2, -2, 2, 2],
    [2, 2, -2, -2],
    [1, -2, 1, 2],
    [2, -2, 2, 2],
  ])('keeps contact and parallel-edge decisions for %j', (...edge) => {
    const clear = boundaryClearance(Float32Array.from(edge));

    for (const bounds of [box(-1, -1, 2, 2), box(0, 0, 0, 0), box(2, 2, 1, 1), box(20, 20, 2, 2)])
      expect(clear(bounds)).toBe(!intersects(edge, bounds));
  });

  it('resets clipping state between edges, queries and independent preparations', () => {
    const edges = new Float32Array([-4, -4, -3, -3, 0, -4, 0, 4]);
    const clear = boundaryClearance(edges);
    const original = edges.slice();

    expect(clear(box(-1, -1, 2, 2))).toBe(false);
    expect(clear(box(1, 1, 1, 1))).toBe(true);
    expect(clear(box(-1, -1, 2, 2))).toBe(false);
    expect(edges).toEqual(original);
    edges.fill(100);
    expect(boundaryClearance(edges)(box(-1, -1, 2, 2))).toBe(true);
    expect(clear(box(-1, -1, 2, 2))).toBe(false);
    expect(boundaryClearance(new Float32Array())(box(0, 0, 1, 1))).toBe(true);
  });

  it('keeps endpoint differences at JavaScript precision', () => {
    const clear = boundaryClearance(new Float32Array([100_000_000, 0, 1, 0]));

    expect(clear(box(0, -1, 0.5, 2))).toBe(true);
    expect(clear(box(1, -1, 1, 2))).toBe(false);
  });

  it.each([300, 600])('reads each source coordinate once throughout a %i-edge fit', (count) => {
    const source = rectangularBoundary(count);
    let reads = 0;
    const edges = new Proxy(source, {
      get(target, key) {
        if (typeof key === 'string' && /^\d+$/.test(key)) reads++;

        return Reflect.get(target, key, target);
      },
    });

    const spot = fitLabel(face(edges), 'AA')!;
    const bounds = labelBox(spot, textWidth('AA'));

    expect(spot.at).toEqual([10, 6]);
    expect(spot.turned).toBe(false);
    expect(spot.height).toBeGreaterThan(8);
    expect(spot.height).toBeLessThan(10);
    expect(bounds.minY).toBeGreaterThan(0);
    expect(bounds.maxY).toBeLessThan(12);
    expect(reads).toBe(count * 4);
    expect(source).toEqual(rectangularBoundary(count));
  });
});
