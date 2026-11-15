import { describe, expect, it, vi } from 'vitest';
import type { V3 } from './solidField';
import { SweepRaster, type Motion } from './sweepRaster';
import { cross, dot, perpendicular, sub, unit } from './vec';

const TWO_PI = 2 * Math.PI;
const wrap = (a: number) => a - TWO_PI * Math.floor((a + Math.PI) / TWO_PI);
const points: V3[] = Array.from({ length: 45 }, (_, i) => [
  Math.fround(9 * Math.sin(i * 1.3)),
  Math.fround(7 * Math.cos(i * 0.7)),
  Math.fround((i % 7) - 3),
]);

function coordinates(motion: Motion, point: V3): V3 {
  const axis = unit(motion.axis);
  const u = perpendicular(axis);
  const w = cross(axis, u);
  const d = sub(point, motion.origin);
  const a = dot(d, u);
  const b = dot(d, w);
  const along = dot(d, axis);

  return motion.kind === 'prismatic' ? [a, b, along] : [Math.hypot(a, b), along, Math.atan2(b, a)];
}

function intervals(motion: Motion, cell: number, [p, , s]: V3): Array<[number, number]> {
  const [lo, hi] = motion.range;

  if (motion.kind === 'prismatic') return [[s - hi - cell, s - lo + cell]];

  const slack = cell / Math.max(p, cell);
  const width = hi - lo + 2 * slack;

  if (width >= TWO_PI) return [[-Infinity, Infinity]];

  const from = wrap(s - hi - slack);
  const to = from + width;

  return to <= Math.PI
    ? [[from, to]]
    : [
        [from, Math.PI],
        [-Math.PI, to - TWO_PI],
      ];
}

function fixture(
  motion: Motion,
  cell: number,
  samples = points,
  soup = Float32Array.from(samples.flatMap((p) => [...p, ...p, ...p])),
) {
  const original = soup.slice();
  const raster = new SweepRaster(motion, cell);

  raster.addSoup(soup);
  raster.seal();

  const projected = samples.map((p) => coordinates(motion, p));
  const expected = (point: V3) => {
    const query = coordinates(motion, point);
    const spans = intervals(motion, cell, query);

    return projected.some(
      (p) =>
        Math.abs(Math.floor(p[0] / cell) - Math.floor(query[0] / cell)) <= 1 &&
        Math.abs(Math.floor(p[1] / cell) - Math.floor(query[1] / cell)) <= 1 &&
        spans.some(([from, to]) => p[2] >= from && p[2] <= to),
    );
  };

  return { raster, expected, soup, original };
}

const queries: V3[] = Array.from({ length: 300 }, (_, i) => [
  12 * Math.sin(i * 0.21),
  10 * Math.cos(i * 0.33),
  (i % 11) - 5,
]);
const ranges: Array<[number, number]> = [
  [0, 0],
  [-0.7, 1.2],
  [-Math.PI, Math.PI],
  [TWO_PI, TWO_PI + 0.2],
  [-8, -7],
  [-10, 10],
  [0.5, -0.5],
  [-Infinity, Infinity],
];

function checkQueries(raster: SweepRaster, expected: (p: V3) => boolean): void {
  for (const query of queries) expect(raster.hits(...query)).toBe(expected(query));
}

function surfaceSamples(soup: Float32Array, cell: number): V3[] {
  const samples: V3[] = [];

  for (let t = 0; t + 8 < soup.length; t += 9) {
    const vertices = [0, 3, 6].map((offset) => Array.from(soup.subarray(t + offset, t + offset + 3)) as V3);
    const edge = Math.max(...vertices.map((p, i) => Math.hypot(...sub(p, vertices[(i + 1) % 3]))));
    const n = Math.max(1, Math.ceil(edge / (cell * 0.75)));

    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n - i; j++) {
        samples.push(
          [0, 1, 2].map(
            (k) =>
              vertices[0][k] +
              (vertices[1][k] - vertices[0][k]) * (i / n) +
              (vertices[2][k] - vertices[0][k]) * (j / n),
          ) as V3,
        );
      }
    }
  }

  return samples;
}

describe('continuous shell sweep queries', () => {
  it.each(['revolute', 'prismatic'] as const)(
    'samples triangle interiors for %s sweeps without changing sources',
    (kind) => {
      const motion: Motion = { kind, origin: [1.25, -2.5, 0.75], axis: [1, -2, 3], range: [-0.7, 1.2] };
      const source = Float32Array.from(points.slice(0, 9).flat());
      const soup = source.subarray(3, source.length - 6);

      for (const cell of [0.4, 1, 2.5]) {
        const samples = surfaceSamples(soup, cell);
        const { raster, expected, original } = fixture(motion, cell, samples, soup);

        checkQueries(raster, expected);

        for (let i = 0; i < samples.length; i += Math.max(1, Math.floor(samples.length / 40))) {
          expect(raster.hits(...samples[i])).toBe(expected(samples[i]));
        }

        expect(soup).toEqual(original);
      }
    },
  );

  it.each(['revolute', 'prismatic'] as const)(
    'matches direct sample scans for %s motions and edited ranges',
    (kind) => {
      for (const axis of [
        [0, 0, 1],
        [1, -2, 3],
        [0, 0, 0],
      ] as V3[]) {
        for (const cell of [0.4, 1, 2.5]) {
          const motion: Motion = { kind, origin: [1.25, -2.5, 0.75], axis, range: [0, 0] };
          const { raster, expected, soup, original } = fixture(motion, cell);

          for (const range of ranges) {
            motion.range = range;

            checkQueries(raster, expected);
          }

          expect(soup).toEqual(original);
        }
      }
    },
  );

  it('keeps seam endpoints, full turns and interleaved rasters independent', () => {
    const motion: Motion = { kind: 'revolute', origin: [0, 0, 0], axis: [0, 0, 1], range: [0, 0] };
    const samples: V3[] = [
      [0, -10, 0],
      [0, 10, 0],
      [0, 0, 0],
    ];
    const first = fixture(motion, 1, samples);
    const secondMotion: Motion = { ...motion, kind: 'prismatic', range: [-2, 3] };
    const second = fixture(secondMotion, 0.5, samples);

    for (const range of ranges) {
      motion.range = range;

      for (const angle of [-Math.PI, -Math.PI + 0.1, -0.1, 0, 0.1, Math.PI - 0.1, Math.PI]) {
        const query: V3 = [-10 * Math.sin(angle), 10 * Math.cos(angle), 0];

        expect(first.raster.hits(...query)).toBe(first.expected(query));
        expect(second.raster.hits(...query)).toBe(second.expected(query));
        expect(first.raster.hits(...query)).toBe(first.expected(query));
      }
    }

    expect(first.raster.hits(0, 0, 0)).toBe(true);
    expect(new SweepRaster(motion, 1).hits(0, 0, 0)).toBe(false);
    expect(first.raster.hits(NaN, 0, 0)).toBe(false);
    expect(first.raster.hits(Infinity, 0, 0)).toBe(false);
  });

  it.each([300, 600])('queries %i populated rows without array callbacks', (count) => {
    const motion: Motion = { kind: 'revolute', origin: [0, 0, 0], axis: [0, 0, 1], range: [0, 0] };
    const { raster } = fixture(motion, 1, [[0, 10, 0]]);
    const some = vi.spyOn(Array.prototype, 'some');
    let hits = 0;
    let calls: number;

    try {
      for (let i = 0; i < count; i++) hits += Number(raster.hits(0, i % 2 ? -10 : 10, 0));

      calls = some.mock.calls.length;
    } finally {
      some.mockRestore();
    }

    expect(hits).toBe(count / 2);
    expect(calls).toBe(0);
  });
});
