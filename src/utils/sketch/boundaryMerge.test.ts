import { describe, expect, it } from 'vitest';
import { mergeCollinear } from './boundaryMerge';
import type { Vec2 } from './types';

const KEY_STEP = 1e-3;
const keyOf = (p: Vec2) => `${Math.round(p[0] / KEY_STEP)},${Math.round(p[1] / KEY_STEP)}`;

const direction = ([p, q]: [Vec2, Vec2]) => {
  const len = Math.hypot(q[0] - p[0], q[1] - p[1]);

  return [(q[0] - p[0]) / len, (q[1] - p[1]) / len];
};

function joinStep(edges: Array<[Vec2, Vec2]>): boolean {
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const joined = joinPair(edges[i], edges[j]);

      if (!joined) continue;

      edges.splice(j, 1);
      edges[i] = joined;

      return true;
    }
  }

  return false;
}

function joinPair(a: [Vec2, Vec2], b: [Vec2, Vec2]): [Vec2, Vec2] | null {
  const [ax, ay] = direction(a);
  const [bx, by] = direction(b);

  if (Math.abs(ax * by - ay * bx) > 1e-6) return null;

  const pairs: Array<[Vec2, Vec2, Vec2, Vec2]> = [
    [a[0], b[0], a[1], b[1]],
    [a[0], b[1], a[1], b[0]],
    [a[1], b[0], a[0], b[1]],
    [a[1], b[1], a[0], b[0]],
  ];
  const shared = pairs.find(([p, q]) => keyOf(p) === keyOf(q));

  return shared ? [shared[2], shared[3]] : null;
}

function previousMerge(edges: Array<[Vec2, Vec2]>) {
  const out = [...edges];

  while (joinStep(out));

  return out;
}

describe('Sketch boundary merging', () => {
  it('preserves pair priority, winding, quantized joins and later edits', () => {
    let seed = 214;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;

      return seed / 2 ** 32;
    };

    for (let trial = 0; trial < 200; trial++) {
      const edges: Array<[Vec2, Vec2]> = [];

      for (let i = 0; i < 24; i++) {
        const x = Math.floor(random() * 8);
        const y = Math.floor(random() * 4);
        const end: Vec2 = random() < 0.5 ? [x + 1, y] : [x, y + 1];
        const edge: [Vec2, Vec2] = [[x + (trial % 3) * 0.0001, y], end];

        edges.push(random() < 0.5 ? edge : [edge[1], edge[0]]);
      }

      const saved = structuredClone(edges);
      const result = structuredClone(mergeCollinear(edges));

      expect(result).toEqual(previousMerge(edges));
      expect(edges).toEqual(saved);
      edges[0][0][0] += 0.2;
      expect(mergeCollinear(edges)).toEqual(previousMerge(edges));
      expect(mergeCollinear(saved)).toEqual(result);
    }
  });

  it('preserves degenerate and nonfinite comparisons', () => {
    const cases: Array<Array<[Vec2, Vec2]>> = [
      [],
      [
        [
          [0, 0],
          [0, 0],
        ],
        [
          [0, 0],
          [1, 0],
        ],
      ],
      [
        [
          [NaN, 0],
          [1, 0],
        ],
        [
          [1, 0],
          [2, 0],
        ],
      ],
      [
        [
          [Infinity, 0],
          [1, 0],
        ],
        [
          [1, 0],
          [2, 0],
        ],
      ],
      [
        [
          [0, 0],
          [1, 0.0000009],
        ],
        [
          [1, 0.0000009],
          [2, 0],
        ],
      ],
      [
        [
          [0, 0],
          [1, 0.0000011],
        ],
        [
          [1, 0.0000011],
          [2, 0],
        ],
      ],
    ];

    for (const edges of cases) expect(mergeCollinear(edges)).toEqual(previousMerge(edges));
  });

  it('prepares directions once per retained edge instead of once per candidate pair', () => {
    for (const size of [100, 200]) {
      let reads = 0;
      const edges: Array<[Vec2, Vec2]> = Array.from({ length: size }, (_, i) => [
        [i * 3, 0],
        [i * 3 + 1, 0],
      ]);

      for (const edge of edges) {
        for (const point of edge) {
          const value = point[0];

          Object.defineProperty(point, 0, {
            get: () => {
              reads++;

              return value;
            },
          });
        }
      }

      const previous = previousMerge(edges);
      const previousReads = reads;

      reads = 0;

      const result = mergeCollinear(edges);

      expect(reads).toBe(6 * size);
      expect(previousReads).toBe(8 * size * (size - 1));
      expect(result).toEqual(previous);
    }
  });
});
