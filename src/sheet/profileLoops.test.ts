import { describe, expect, it } from 'vitest';
import { loopsOf, type Edge } from './profileLoops';

type Point = Edge[number];

function ring(x: number, radius: number, reverse = false): Point[] {
  const points: Point[] = [
    [x - radius, -radius],
    [x + radius, -radius],
    [x + radius, radius],
    [x - radius, radius],
  ];

  return reverse ? points.reverse() : points;
}

const edgesOf = (points: Point[]): Edge[] => points.map((p, i) => [p, points[(i + 1) % points.length]]);

describe('sheet boundary loop ordering', () => {
  it('orders both windings by area and keeps discovery order for equal areas', () => {
    const rings = [ring(0, 2), ring(20, 5, true), ring(40, 2, true), ring(60, 8), ring(90, 1)];
    const edges = rings.flatMap(edgesOf);
    const original = structuredClone(edges);
    const loops = loopsOf(edges)!;

    expect(loops).toEqual([rings[3], rings[1], rings[0], rings[2], rings[4]]);
    expect(loops[0][0]).toBe(rings[3][0]);
    expect(edges).toEqual(original);
  });

  it('reads edited boundaries afresh and returns independent loop containers', () => {
    const small = ring(0, 1);
    const large = ring(20, 3);
    const edges = [...edgesOf(small), ...edgesOf(large)];
    const first = loopsOf(edges)!;

    for (const point of small) {
      point[0] *= 10;
      point[1] *= 10;
    }

    const second = loopsOf(edges)!;

    expect(first[0]).toEqual(large);
    expect(second).toEqual([small, large]);
    expect(second[1]).not.toBe(first[0]);
  });

  it('keeps empty boundaries and refuses open or branching boundaries', () => {
    const edges = edgesOf(ring(0, 1));

    expect(loopsOf([])).toEqual([]);
    expect(loopsOf(edges)).toEqual([edges.map(([point]) => point)]);
    expect(loopsOf(edges.slice(1))).toBeUndefined();
    expect(loopsOf([...edges, [edges[0][0], [10, 10]]])).toBeUndefined();
    expect(
      loopsOf([
        [
          [0, 0],
          [1, 0],
        ],
        [
          [1, 0],
          [0, 0],
        ],
      ]),
    ).toBeUndefined();
  });

  it('retains last point references at rounded shared endpoints', () => {
    const points = ring(0, 2);
    const edges = edgesOf(points).map(([a, b]): Edge => [[...a], [...b]]);
    const last = edges[3][1];

    last[0] += 0.00001;

    const loop = loopsOf(edges)![0];

    expect(loop).toEqual([last, edges[1][0], edges[2][0], edges[3][0]]);
    expect(loop[0]).toBe(last);
    expect(
      loopsOf([
        [
          [0, 0],
          [0, 0],
        ],
      ]),
    ).toBeUndefined();
    expect(loopsOf([...edges, [last, last]])).toBeUndefined();
  });

  it.each([300, 600])('stops reading a %i-edge branch at its third incident edge', (count) => {
    let reads = 0;
    const center: Point = [0, 0];
    const edges: Edge[] = Array.from({ length: count }, (_, i) => {
      const endpoint: Point = [i + 1, 1];

      Object.defineProperty(endpoint, 0, {
        get: () => {
          reads++;

          return i + 1;
        },
      });

      return [center, endpoint];
    });

    expect(loopsOf(edges)).toBeUndefined();
    expect(reads).toBe(3);
    expect(center).toEqual([0, 0]);
  });
});
