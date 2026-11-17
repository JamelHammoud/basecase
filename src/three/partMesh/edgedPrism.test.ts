import { describe, expect, it } from 'vitest';
import type { PartEdges } from '../../types/robotics';
import type { Outline } from '../../utils/partEdges';
import { prismTriangles } from './edgedGeometry';
import { edgeLayers, outlineCorners } from './edgedProfile';

type Point = [number, number, number];

function formerPrism(outline: Outline, height: number, edges: PartEdges, middle: number): number[] {
  const corners = outlineCorners(outline, edges);
  const rings = edgeLayers(height, edges, middle).map(([y, reach]) =>
    corners
      .flatMap(({ center, dirs }) => dirs.map((d) => [center[0] + d[0] * reach, center[1] + d[1] * reach]))
      .map(([x, z]): Point => [x, y, z]),
  );
  const values: number[] = [];
  const add = (a: Point, b: Point, c: Point) => {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];

    if (Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) > 1e-9) values.push(...a, ...b, ...c);
  };

  for (let k = 0; k + 1 < rings.length; k++) {
    const [low, high] = [rings[k], rings[k + 1]];

    low.forEach((a, j) => {
      const next = (j + 1) % low.length;

      add(a, low[next], high[next]);
      add(a, high[next], high[j]);
    });
  }

  const cap = corners.map(({ center }) => center);

  for (let i = 1; i + 1 < cap.length; i++) {
    const [a, b, c] = [cap[0], cap[i], cap[i + 1]];

    add([a[0], height / 2, a[1]], [b[0], height / 2, b[1]], [c[0], height / 2, c[1]]);
    add([a[0], -height / 2, a[1]], [c[0], -height / 2, c[1]], [b[0], -height / 2, b[1]]);
  }

  return values;
}

const outlines: Outline[] = [
  [],
  [[0, 0]],
  [
    [0, 0],
    [4, 2],
  ],
  [
    [0, 0],
    [0, 0],
    [3, 2],
    [4, 0],
  ],
  [
    [-0, 0],
    [0, -0],
    [0, 0],
  ],
  [
    [0, 0],
    [1e-12, 0],
    [0, 1e-12],
  ],
  ...Array.from({ length: 24 }, (_, seed): Outline =>
    Array.from({ length: 3 + (seed % 6) }, (_, i) => {
      const angle = (i * 2 * Math.PI) / (3 + (seed % 6));

      return [Math.cos(angle) * (seed + 2), Math.sin(angle) * (seed + 3)];
    }),
  ),
];

describe('edged prism ring reuse', () => {
  it.each<PartEdges['kind']>(['fillet', 'chamfer'])(
    'preserves exact %s triangles across outlines and layers',
    (kind) => {
      for (const outline of outlines) {
        for (const ring of [outline, [...outline].reverse()]) {
          const before = structuredClone(ring);
          const edges = { kind, mm: 0.2 };

          for (const middle of [1, 16]) {
            expect(prismTriangles(ring, 12, edges, middle)).toEqual(formerPrism(ring, 12, edges, middle));
          }

          expect(ring).toEqual(before);
        }
      }
    },
  );

  it('reads changed outlines afresh and retains independent output', () => {
    const outline: Outline = [
      [0, 0],
      [0, 10],
      [12, 10],
      [12, 0],
    ];
    const edges: PartEdges = { kind: 'fillet', mm: 0.5 };
    const first = prismTriangles(outline, 10, edges, 16);
    const saved = [...first];

    outline[0][0] = -5;
    expect(prismTriangles(outline, 8, edges, 1)).toEqual(formerPrism(outline, 8, edges, 1));
    expect(first).toEqual(saved);
  });
});
