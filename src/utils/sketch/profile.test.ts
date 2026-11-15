import { describe, expect, it, vi } from 'vitest';
import { arcPoints, circlePoints, sketchProfile } from './profile';
import { EMPTY_SKETCH, type Sketch, type Vec2 } from './types';

function polygon(sketch: Sketch, vertices: Vec2[]): Sketch {
  const prefix = `p${sketch.points.length}-`;

  return {
    ...sketch,
    points: [...sketch.points, ...vertices.map(([x, y], i) => ({ id: `${prefix}${i}`, x, y }))],
    entities: [
      ...sketch.entities,
      ...vertices.map((_, i) => ({
        id: `${prefix}e${i}`,
        kind: 'line' as const,
        a: `${prefix}${i}`,
        b: `${prefix}${(i + 1) % vertices.length}`,
      })),
    ],
  };
}

const square = (x: number, size: number): Vec2[] => [
  [x, 0],
  [x + size, 0],
  [x + size, size],
  [x, size],
];

const outlinePoints = (size: number): Vec2[] =>
  Array.from({ length: size * 10 }, (_, i) => {
    const angle = (i * 2 * Math.PI) / (size * 10);

    return [100 * Math.cos(angle), 100 * Math.sin(angle)];
  });

function perforatedOutline(size: number): Sketch {
  const sketch = polygon(EMPTY_SKETCH, outlinePoints(size));

  return {
    ...sketch,
    entities: [
      ...sketch.entities,
      ...Array.from({ length: size }, (_, i) => ({ id: `hole${i}`, kind: 'circle' as const, c: `c${i}`, r: 0.1 })),
    ],
    points: [
      ...sketch.points,
      ...Array.from({ length: size }, (_, i) => ({ id: `c${i}`, x: (i % 20) - 10, y: Math.floor(i / 20) - 10 })),
    ],
  };
}

describe('sketch profile boundaries', () => {
  it('keeps hole order, excludes outside loops and preserves the source sketch', () => {
    const outer = square(-10, 20).reverse();
    const inside = square(-5, 2);
    const nested = square(-4.5, 0.5);
    const sketch = [inside, outer, square(30, 10), nested].reduce(polygon, EMPTY_SKETCH);
    const before = structuredClone(sketch);

    expect(sketchProfile(sketch)).toEqual({ outer, holes: [inside, nested] });
    expect(sketch).toEqual(before);
  });

  it('keeps the first outer loop when absolute areas tie', () => {
    const first = square(0, 10).reverse();
    const second = square(20, 10);

    expect(sketchProfile(polygon(polygon(EMPTY_SKETCH, first), second))).toEqual({ outer: first, holes: [] });
    expect(sketchProfile(polygon(polygon(EMPTY_SKETCH, second), first))).toEqual({ outer: second, holes: [] });
  });

  it.each([0, 1e-6, 1.01e-6])('retains the area cutoff for a rectangle with area %s', (area) => {
    const vertices: Vec2[] = [
      [0, 0],
      [1, 0],
      [1, area],
      [0, area],
    ];

    expect(sketchProfile(polygon(EMPTY_SKETCH, vertices))).toEqual(area > 1e-6 ? { outer: vertices, holes: [] } : null);
  });

  it('rejects empty, open, reference-only and non-finite outlines', () => {
    const sketch = polygon(EMPTY_SKETCH, square(0, 10));
    const open = { ...sketch, entities: sketch.entities.slice(1) };
    const reference = { ...sketch, entities: sketch.entities.map((e) => ({ ...e, ref: true })) };
    const nonFinite = { ...sketch, points: sketch.points.map((p) => ({ ...p, x: NaN })) };

    for (const source of [EMPTY_SKETCH, open, reference, nonFinite]) expect(sketchProfile(source)).toBeNull();
  });

  it('selects an arc outline with a circle hole', () => {
    const sketch: Sketch = {
      points: [
        { id: 'a', x: 10, y: 0 },
        { id: 'b', x: -10, y: 0 },
        { id: 'o', x: 0, y: 0 },
        { id: 'h', x: 0, y: 3 },
      ],
      entities: [
        { id: 'arc', kind: 'arc', c: 'o', a: 'a', b: 'b' },
        { id: 'base', kind: 'line', a: 'b', b: 'a' },
        { id: 'hole', kind: 'circle', c: 'h', r: 1 },
      ],
      constraints: [],
    };

    expect(sketchProfile(sketch)).toEqual({
      outer: [...arcPoints([0, 0], [10, 0], [-10, 0]).slice(0, -1), [-10, 0]],
      holes: [circlePoints([0, 3], 1)],
    });
  });

  it.each([100, 200])('measures each loop once with %i holes and rebuilds after an edit', (size) => {
    const sketch = perforatedOutline(size);
    const magnitude = vi.spyOn(Math, 'abs');
    let profile: ReturnType<typeof sketchProfile>;

    try {
      profile = sketchProfile(sketch);
      expect(magnitude).toHaveBeenCalledTimes(size + 1);
    } finally {
      magnitude.mockRestore();
    }

    expect(profile!.outer).toEqual(outlinePoints(size));
    expect(profile!.holes).toHaveLength(size);

    const changed = {
      ...sketch,
      entities: [...sketch.entities, { id: 'larger', kind: 'circle' as const, c: 'c0', r: 200 }],
    };
    const edited = sketchProfile(changed)!;

    expect(edited.outer).toEqual(circlePoints([-10, -10], 200));
    expect(edited.holes).toHaveLength(size + 1);
    expect(profile!.holes).toHaveLength(size);
  });
});
