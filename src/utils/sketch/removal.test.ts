import { describe, expect, it } from 'vitest';
import { seededRandom } from '../seededRandom';
import { entityPoints, removeItems } from './edit';
import type { Sketch, SketchEntity, SketchPoint } from './types';

function previousRemoval(sketch: Sketch, ids: string[]): Sketch {
  const isRef = (id: string) => {
    const entity = sketch.entities.find((e) => e.id === id);

    return entity?.kind === 'line' && !!entity.ref;
  };
  const gone = new Set(ids.filter((id) => !isRef(id)));
  const entities = sketch.entities.filter((e) => !gone.has(e.id));
  const used = new Set(entities.flatMap(entityPoints));
  const points = sketch.points.filter((p) => p.fixed || used.has(p.id));
  const dropped = new Set([...gone, ...sketch.points.filter((p) => !points.includes(p)).map((p) => p.id)]);
  const mentions = (constraint: Sketch['constraints'][number]) =>
    Object.entries(constraint).some(
      ([key, value]) => key !== 'id' && key !== 'kind' && typeof value === 'string' && dropped.has(value),
    );

  return { points, entities, constraints: sketch.constraints.filter((c) => !dropped.has(c.id) && !mentions(c)) };
}

function mixedSketch(): Sketch {
  return {
    points: [
      { id: 'r0', x: 0, y: 0, fixed: true },
      { id: 'r1', x: 10, y: 0, fixed: true },
      { id: 'a', x: 0, y: 10 },
      { id: 'b', x: 10, y: 10 },
      { id: 'c', x: 5, y: 15 },
      { id: 'orphan', x: 20, y: 20 },
      { id: 'fixedOrphan', x: 30, y: 30, fixed: true },
    ],
    entities: [
      { id: 'ref', kind: 'line', a: 'r0', b: 'r1', ref: true },
      { id: 'line', kind: 'line', a: 'a', b: 'b' },
      { id: 'circle', kind: 'circle', c: 'b', r: 5 },
      { id: 'arc', kind: 'arc', c: 'c', a: 'a', b: 'b' },
    ],
    constraints: [
      { id: 'refAngle', kind: 'angle', line: 'ref', value: 0 },
      { id: 'horizontal', kind: 'horizontal', line: 'line' },
      { id: 'circleRadius', kind: 'radius', entity: 'circle', value: 5 },
      { id: 'arcRadius', kind: 'radius', entity: 'arc', value: 5 },
      { id: 'orphanCoincident', kind: 'coincident', a: 'orphan', b: 'b' },
      { id: 'fixedDistance', kind: 'distance', a: 'r0', b: 'fixedOrphan', value: 30 },
      { id: 'sharedDistance', kind: 'distance', a: 'a', b: 'b', value: 10 },
      { id: 'parallel', kind: 'parallel', a: 'ref', b: 'line' },
      { id: 'perpendicular', kind: 'perpendicular', a: 'ref', b: 'line' },
      { id: 'tangent', kind: 'tangent', a: 'circle', b: 'line' },
      { id: 'equal', kind: 'equal', a: 'circle', b: 'arc' },
      { id: 'length', kind: 'length', line: 'line', value: 10 },
      { id: 'vertical', kind: 'vertical', line: 'line' },
      { id: 'relativeAngle', kind: 'angle', line: 'ref', other: 'line', value: 90 },
    ],
  };
}

function countedSketch(size: number) {
  let entityReads = 0;
  let pointComparisons = 0;

  class CountedPoints extends Array<SketchPoint> {
    includes(point: SketchPoint): boolean {
      for (const retained of this) {
        pointComparisons++;

        if (retained === point) return true;
      }

      return false;
    }
  }

  const points = new CountedPoints();
  const entities = Array.from({ length: size }, (_, i): SketchEntity => {
    const id = `line${i}`;

    points.push({ id: `a${i}`, x: i, y: 0 }, { id: `b${i}`, x: i, y: 10 });

    return {
      get id() {
        entityReads++;

        return id;
      },
      kind: 'line',
      a: `a${i}`,
      b: `b${i}`,
    };
  });

  return {
    sketch: { points, entities, constraints: [] } satisfies Sketch,
    counts: () => ({ entityReads, pointComparisons }),
  };
}

describe('Sketch deletion cleanup', () => {
  it('keeps face references, shared centers and fixed points while pruning orphan constraints', () => {
    const sketch = mixedSketch();
    const before = structuredClone(sketch);
    const after = removeItems(sketch, ['ref', 'line', 'arc', 'line', 'missing']);

    expect(after.entities.map((e) => e.id)).toEqual(['ref', 'circle']);
    expect(after.points.map((p) => p.id)).toEqual(['r0', 'r1', 'b', 'fixedOrphan']);
    expect(after.constraints.map((c) => c.id)).toEqual(['refAngle', 'circleRadius', 'fixedDistance']);
    expect(after.entities[0]).toBe(sketch.entities[0]);
    expect(after.points[2]).toBe(sketch.points[3]);
    expect(after.constraints[1]).toBe(sketch.constraints[2]);
    expect(sketch).toEqual(before);
  });

  it('preserves selected-point and selected-constraint behavior without removing attached geometry', () => {
    const sketch = mixedSketch();
    const after = removeItems(sketch, ['a', 'r0', 'circleRadius']);

    expect(after.entities).toEqual(sketch.entities);
    expect(after.points.map((p) => p.id)).toEqual(['r0', 'r1', 'a', 'b', 'c', 'fixedOrphan']);
    expect(after.constraints.map((c) => c.id)).toEqual([
      'refAngle',
      'horizontal',
      'arcRadius',
      'parallel',
      'perpendicular',
      'tangent',
      'equal',
      'length',
      'vertical',
      'relativeAngle',
    ]);
  });

  it('matches the previous cleanup for mixed selections, absent ids and changed sketches', () => {
    const random = seededRandom('8e04f0ba8e04f0ba8e04f0ba8e04f0ba');
    const sketch = mixedSketch();
    const ids = [...sketch.points, ...sketch.entities, ...sketch.constraints].map((item) => item.id);

    ids.push('missing');

    for (let i = 0; i < 120; i++) {
      const selected = ids.filter(() => random() < 0.35);
      const before = structuredClone(sketch);

      expect(removeItems(sketch, [...selected, ...selected])).toEqual(previousRemoval(sketch, selected));
      expect(sketch).toEqual(before);
    }

    const beforeEdits = structuredClone(sketch);
    const first = removeItems(sketch, ['line', 'arc']);

    sketch.entities[0] = { id: 'ref', kind: 'line', a: 'r0', b: 'r1' };
    sketch.points[3] = { ...sketch.points[3], fixed: true };

    expect(removeItems(sketch, ['ref', 'circle', 'arc'])).toEqual(previousRemoval(sketch, ['ref', 'circle', 'arc']));
    expect(removeItems(sketch, ['ref', 'circle', 'arc']).entities.map((e) => e.id)).toEqual(['line']);
    expect(removeItems(beforeEdits, ['line', 'arc'])).toEqual(first);
    expect(removeItems({ points: [], entities: [], constraints: [] }, [])).toEqual({
      points: [],
      entities: [],
      constraints: [],
    });
    expect(removeItems(sketch, [])).toEqual(previousRemoval(sketch, []));
  });

  it('keeps the first matching entity rule for repeated ids', () => {
    const sketch = mixedSketch();
    const line: SketchEntity = { id: 'ref', kind: 'line', a: 'a', b: 'b' };

    sketch.entities.unshift(line);

    expect(removeItems(sketch, ['ref'])).toEqual(previousRemoval(sketch, ['ref']));
    expect(removeItems(sketch, ['ref']).entities.some((e) => e.id === 'ref')).toBe(false);

    sketch.entities.reverse();

    expect(removeItems(sketch, ['ref'])).toEqual(previousRemoval(sketch, ['ref']));
    expect(removeItems(sketch, ['ref']).entities.filter((e) => e.id === 'ref')).toHaveLength(2);
  });

  it.each([300, 600])('cleans a %i-line sketch without repeated entity or retained-point searches', (size) => {
    const original = countedSketch(size);
    const current = countedSketch(size);
    const selected = Array.from({ length: size / 2 }, (_, i) => `line${i * 2}`);
    const expected = previousRemoval(original.sketch, selected);

    expect(original.counts()).toEqual({
      entityReads: (size * size) / 4 + size,
      pointComparisons: (3 * size * size + size) / 2,
    });

    const after = removeItems(current.sketch, selected);

    expect(current.counts()).toEqual({ entityReads: 2 * size - 1, pointComparisons: 0 });
    expect(after).toEqual(expected);
  });
});
