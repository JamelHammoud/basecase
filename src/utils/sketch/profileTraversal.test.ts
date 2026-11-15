import { describe, expect, it } from 'vitest';
import { arcPoints, circlePoints, sketchLoops } from './profile';
import type { Sketch, SketchLine, Vec2 } from './types';

function sharedVertex(count: number): Sketch {
  return {
    points: [
      { id: 'hub', x: 0, y: 0 },
      ...Array.from({ length: count }, (_, i) => [
        { id: `a${i}`, x: i + 1, y: 1 },
        { id: `b${i}`, x: i + 1, y: -1 },
      ]).flat(),
    ],
    entities: Array.from({ length: count }, (_, i): SketchLine[] => [
      { id: `in${i}`, kind: 'line', a: `a${i}`, b: 'hub' },
      { id: `out${i}`, kind: 'line', a: 'hub', b: `b${i}` },
      { id: `close${i}`, kind: 'line', a: `b${i}`, b: `a${i}` },
    ]).flat(),
    constraints: [],
  };
}

const triangles = (count: number): Vec2[][] =>
  Array.from({ length: count }, (_, i) => [
    [i + 1, 1],
    [0, 0],
    [i + 1, -1],
  ]);

describe('sketch edge traversal', () => {
  it('keeps source order through a shared vertex and rebuilds after edits and undo', () => {
    const sketch = sharedVertex(4);
    const before = structuredClone(sketch);

    expect(sketchLoops(sketch)).toEqual(triangles(4));
    expect(sketch).toEqual(before);

    const edited = { ...sketch, entities: sketch.entities.filter((e) => e.id !== 'close1') };

    expect(sketchLoops(edited)).toEqual([triangles(4)[0], ...triangles(4).slice(2)]);
    expect(sketchLoops(sketch)).toEqual(triangles(4));
    expect(sketch).toEqual(before);
  });

  it('keeps source-order traversal when an open chain consumes every branch', () => {
    const sketch = sharedVertex(3);

    sketch.points.push({ id: 'loose', x: -1, y: 0 });
    sketch.entities.unshift({ id: 'spur', kind: 'line', a: 'loose', b: 'hub' });

    expect(sketchLoops(sketch)).toEqual([]);
  });

  it('preserves reversed arcs, reference exclusion, circles and missing-point fallback', () => {
    const sketch: Sketch = {
      points: [
        { id: 'a', x: 10, y: 0 },
        { id: 'b', x: -10, y: 0 },
        { id: 'c', x: 0, y: 0 },
      ],
      entities: [
        { id: 'reference', kind: 'line', a: 'a', b: 'b', ref: true },
        { id: 'base', kind: 'line', a: 'a', b: 'b' },
        { id: 'arc', kind: 'arc', a: 'a', b: 'b', c: 'c' },
        { id: 'circle', kind: 'circle', c: 'missing', r: 2 },
      ],
      constraints: [],
    };
    const before = structuredClone(sketch);

    expect(sketchLoops(sketch)).toEqual([
      [[10, 0], ...arcPoints([0, 0], [10, 0], [-10, 0]).reverse().slice(0, -1)],
      circlePoints([0, 0], 2),
    ]);
    expect(sketch).toEqual(before);
  });

  it('discards self edges and duplicate ids without changing later loops', () => {
    const sketch = sharedVertex(3);

    sketch.entities.unshift(
      { id: 'self', kind: 'line', a: 'hub', b: 'hub' },
      { id: 'self', kind: 'line', a: 'hub', b: 'a0' },
    );

    expect(sketchLoops(sketch)).toEqual(triangles(3));
  });

  it.each([300, 600])('bounds edge-id reads for %i loops at one vertex', (count) => {
    const sketch = sharedVertex(count);
    let reads = 0;

    for (const edge of sketch.entities) {
      const id = edge.id;

      Object.defineProperty(edge, 'id', {
        get: () => {
          reads++;

          return id;
        },
      });
    }

    expect(sketchLoops(sketch)).toEqual(triangles(count));
    expect(reads).toBeLessThanOrEqual(count * 12);
  });
});
