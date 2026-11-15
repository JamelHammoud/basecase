import { describe, expect, it, vi } from 'vitest';
import { CapBoundary } from './capBoundary';
import { loopsOf, pointKey, type Edge } from './profileLoops';

type Point = Edge[number];

type Triangle = [Point, Point, Point];

function previousBoundary(triangles: Triangle[]): Edge[] | undefined {
  const edges = triangles.flatMap(([a, b, c]): Edge[] => [
    [a, b],
    [b, c],
    [c, a],
  ]);
  const counts = new Map<string, { edge: Edge; count: number }>();

  for (const edge of edges) {
    const key = edge.map(pointKey).sort().join('|');
    const found = counts.get(key) ?? { edge, count: 0 };

    found.count++;
    counts.set(key, found);
  }

  if ([...counts.values()].some(({ count }) => count > 2)) return undefined;

  return [...counts.values()].filter(({ count }) => count === 1).map(({ edge }) => edge);
}

function boundaryOf(triangles: Triangle[]): Edge[] | undefined {
  const boundary = new CapBoundary();

  for (const [a, b, c] of triangles) boundary.add(a, b, c);

  return boundary.edges();
}

function grid(width: number, height: number, holes = false): Triangle[] {
  const triangles: Triangle[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (holes && x % 4 === 1 && y % 4 === 1) continue;

      const a: Point = [x, y];
      const b: Point = [x + 1, y];
      const c: Point = [x + 1, y + 1];
      const d: Point = [x, y + 1];

      triangles.push([a, b, c], [a, c, d]);
    }
  }

  return triangles;
}

describe('sheet cap boundaries', () => {
  it('preserves edge order, winding and point identity across subdivided caps and holes', () => {
    for (let seed = 0; seed < 80; seed++) {
      const triangles = grid(3 + (seed % 9), 3 + (seed % 7), seed % 2 === 0).map((triangle, i): Triangle => {
        const points = triangle.map(([x, y]): Point => [
          x * (seed % 3 === 0 ? -1.25 : 1.5) + seed / 10000,
          y * 2.3 - seed / 10000,
        ]) as Triangle;

        return i % 2 ? (points.reverse() as Triangle) : points;
      });
      const snapshot = structuredClone(triangles);
      const expected = previousBoundary(triangles)!;
      const actual = boundaryOf(triangles)!;

      expect(actual).toEqual(expected);
      expect(loopsOf(actual)).toEqual(loopsOf(expected));
      expect(triangles).toEqual(snapshot);
      actual.forEach((edge, i) => edge.forEach((point, j) => expect(point).toBe(expected[i][j])));
    }
  });

  it('retains rounding, duplicate-edge and nonmanifold decisions', () => {
    const a: Point = [0, -0];
    const b: Point = [2, 0];
    const c: Point = [0, 2];
    const cases: Triangle[][] = [
      [],
      [[a, b, c]],
      [
        [a, b, c],
        [c, b, a],
      ],
      [
        [a, b, c],
        [a, b, c],
        [a, b, c],
      ],
      [[a, a, b]],
      [[a, a, a]],
      [
        [a, b, c],
        [
          [0.000049, 0],
          [0, 2.000049],
          [2, 2],
        ],
      ],
      [
        [a, b, c],
        [
          [0.000051, 0],
          [0, 2.000051],
          [2, 2],
        ],
      ],
      [
        [
          [NaN, 1],
          [Infinity, 2],
          [-Infinity, 3],
        ],
      ],
    ];

    cases.forEach((triangles) => expect(boundaryOf(triangles)).toEqual(previousBoundary(triangles)));
    expect(boundaryOf(cases[3])).toBeUndefined();
    expect(boundaryOf(cases[2])).toEqual([]);
  });

  it('keeps accumulators and returned lists independent and reads later edits afresh', () => {
    const triangles = grid(2, 2);
    const first = new CapBoundary();
    const second = new CapBoundary();

    triangles.forEach(([a, b, c]) => first.add(a, b, c));

    const result = first.edges()!;

    result.length = 0;
    expect(first.edges()).toEqual(previousBoundary(triangles));
    expect(second.edges()).toEqual([]);
    triangles[0][0][0] = -10;
    expect(boundaryOf(triangles)).toEqual(previousBoundary(triangles));
  });

  it.each([150, 300])('halves coordinate rounding for %i two-triangle cells', (cells) => {
    const triangles = grid(10, cells / 10);
    const round = vi.spyOn(Math, 'round');

    try {
      const expected = previousBoundary(triangles);

      expect(round).toHaveBeenCalledTimes(triangles.length * 12);
      round.mockClear();

      const actual = boundaryOf(triangles);

      expect(round).toHaveBeenCalledTimes(triangles.length * 6);
      expect(actual).toEqual(expected);
    } finally {
      round.mockRestore();
    }
  });
});
