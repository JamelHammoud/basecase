import { describe, expect, it } from 'vitest';
import type { Sketch, Vec2 } from '../../utils/sketch/types';
import { hitTest } from './sketchMarks';

function rankedHit(sketch: Sketch, cursor: Vec2, tolerance: number) {
  const points = sketch.points
    .filter((p) => !p.fixed && Math.hypot(p.x - cursor[0], p.y - cursor[1]) <= tolerance)
    .sort((a, b) => Math.hypot(a.x - cursor[0], a.y - cursor[1]) - Math.hypot(b.x - cursor[0], b.y - cursor[1]));

  if (points.length) return { point: points[0].id };

  const at = new Map(sketch.points.map((p) => [p.id, [p.x, p.y]]));
  const entities = sketch.entities
    .map((e) => {
      const c = at.get('c' in e ? e.c : '') ?? [0, 0];
      const d = Math.abs(Math.hypot(cursor[0] - c[0], cursor[1] - c[1]) - ('r' in e ? e.r : 0));

      return { id: e.id, d };
    })
    .filter((e) => e.d <= tolerance)
    .sort((a, b) => a.d - b.d);

  return entities.length ? { entity: entities[0].id } : null;
}

function fixture(seed: number): Sketch {
  const points = Array.from({ length: 40 }, (_, i) => ({
    id: `p${i}`,
    x: ((i * 17 + seed * 13) % 31) - 15,
    y: ((i * 7 + seed * 19) % 29) - 14,
    fixed: (i + seed) % 3 === 0,
  }));

  return {
    points,
    entities: points.map((p, i) => ({ id: `e${i}`, kind: 'circle', c: p.id, r: (i + seed) % 9 })),
    constraints: [],
  };
}

describe('Sketch nearest picking', () => {
  it('matches ranked selection across mixed fixed points, overlapping circles and later edits', () => {
    for (let seed = 0; seed < 100; seed++) {
      const sketch = fixture(seed);
      const before = structuredClone(sketch);
      const cursor: Vec2 = [(seed % 17) - 8, (seed % 13) - 6];

      for (const tolerance of [-1, 0, 0.5, 2, 10, Infinity, NaN]) {
        expect(hitTest(sketch, cursor, tolerance)).toEqual(rankedHit(sketch, cursor, tolerance));
        expect(
          hitTest({ ...sketch, points: sketch.points.map((p) => ({ ...p, fixed: true })) }, cursor, tolerance),
        ).toEqual(
          rankedHit({ ...sketch, points: sketch.points.map((p) => ({ ...p, fixed: true })) }, cursor, tolerance),
        );
      }

      expect(sketch).toEqual(before);
      sketch.points[0].x += 7;
      expect(hitTest(sketch, cursor, 4)).toEqual(rankedHit(sketch, cursor, 4));
    }
  });

  it.each([300, 600])('measures each of %i eligible points once even when every point is in range', (count) => {
    let reads = 0;
    const sketch: Sketch = {
      points: Array.from({ length: count }, (_, i) => ({
        id: `p${i}`,
        get x() {
          reads++;

          return count - i;
        },
        y: 0,
      })),
      entities: [],
      constraints: [],
    };

    expect(hitTest(sketch, [0, 0], count)).toEqual({ point: `p${count - 1}` });
    expect(reads).toBe(count);
    reads = 0;
    expect(rankedHit(sketch, [0, 0], count)).toEqual({ point: `p${count - 1}` });
    expect(reads).toBe(count * 3 - 2);
  });

  it('accepts infinite distances at an infinite tolerance and rejects NaN distances', () => {
    const sketch: Sketch = {
      points: [
        { id: '', x: Infinity, y: 0 },
        { id: 'nan', x: NaN, y: 0 },
      ],
      entities: [],
      constraints: [],
    };

    expect(hitTest(sketch, [0, 0], Infinity)).toEqual({ point: '' });
    sketch.points.forEach((p) => {
      p.fixed = true;
    });
    sketch.entities = [{ id: '', kind: 'circle', c: 'missing', r: Infinity }];
    expect(hitTest(sketch, [0, 0], Infinity)).toEqual({ entity: '' });
  });
});
