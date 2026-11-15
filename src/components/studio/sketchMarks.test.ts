import { describe, expect, it } from 'vitest';
import type { PairKind, Sketch, SketchConstraint } from '../../utils/sketch/types';
import { constraintGlyphs, dimensionLabels, hitTest } from './sketchMarks';

function mixedSketch(): Sketch {
  return {
    points: [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 10, y: 0 },
      { id: 'c', x: 20, y: 10, fixed: true },
      { id: 'rim', x: 23, y: 14, fixed: true },
    ],
    entities: [
      { id: 'line', kind: 'line', a: 'a', b: 'b' },
      { id: 'circle', kind: 'circle', c: 'c', r: 3 },
      { id: 'arc', kind: 'arc', c: 'c', a: 'rim', b: 'b' },
      { id: 'reference', kind: 'line', a: 'a', b: 'c', ref: true },
    ],
    constraints: [],
  };
}

const dimensions: SketchConstraint[] = [
  { id: 'length', kind: 'length', line: 'line', value: 10 },
  { id: 'angle', kind: 'angle', line: 'line', value: 0 },
  { id: 'diameter', kind: 'radius', entity: 'circle', value: 3 },
  { id: 'radius', kind: 'radius', entity: 'arc', value: 5 },
  { id: 'points', kind: 'distance', a: 'a', b: 'b', value: 10 },
  { id: 'entities', kind: 'distance', a: 'line', b: 'circle', value: 15 },
];

function countedSketch(count: number) {
  let reads = 0;
  const sketch: Sketch = {
    points: Array.from({ length: count }, (_, i) => ({
      get id() {
        reads++;

        return `p${i}`;
      },
      x: i,
      y: 0,
      fixed: true,
    })),
    entities: Array.from({ length: count }, (_, i) => ({ id: `e${i}`, kind: 'circle', c: `p${i}`, r: 1 })),
    constraints: Array.from({ length: count }, (_, i) => ({
      id: `r${i}`,
      kind: 'radius',
      entity: `e${i}`,
      value: 1,
    })),
  };

  return { sketch, reads: () => reads };
}

describe('sketch picking and marks', () => {
  it('picks points before entities, keeps first ties and includes the tolerance boundary', () => {
    const sketch = mixedSketch();

    expect(hitTest(sketch, [1, 0], 1)).toEqual({ point: 'a' });
    expect(hitTest(sketch, [5, 0], 5)).toEqual({ point: 'a' });
    expect(hitTest(sketch, [5, 1], 1)).toEqual({ entity: 'line' });
    expect(hitTest(sketch, [23, 10], 0)).toEqual({ entity: 'circle' });
    expect(hitTest(sketch, [20, 15], 0)).toEqual({ entity: 'arc' });
    expect(hitTest(sketch, [10, 5], 0)).toEqual({ entity: 'reference' });
    expect(hitTest(sketch, [100, 100], 1)).toBeNull();

    sketch.entities.unshift({ id: 'first', kind: 'line', a: 'a', b: 'b' });
    expect(hitTest(sketch, [5, 0], 0)).toEqual({ entity: 'first' });
  });

  it('places every dimension kind and measures selected lines, circles and arcs', () => {
    const sketch = mixedSketch();
    const selected = ['line', 'circle', 'arc', 'reference', 'missing'];

    expect(dimensionLabels(sketch, selected, 2)).toEqual([
      { key: 'measure-line', entity: 'line', value: 10, at: [5, 3.2] },
      { key: 'measure-circle', entity: 'circle', value: 6, at: [20, 15] },
      { key: 'measure-arc', entity: 'arc', value: 5, at: [20, 17] },
    ]);

    sketch.constraints = structuredClone(dimensions);

    const before = structuredClone(sketch);

    expect(dimensionLabels(sketch, selected, 2)).toEqual([
      { key: 'length', constraint: 'length', entity: 'line', value: 10, at: [5, 3.2] },
      { key: 'angle', constraint: 'angle', entity: undefined, value: 0, at: [5, -2] },
      { key: 'diameter', constraint: 'diameter', entity: 'circle', value: 6, at: [20, 15] },
      { key: 'radius', constraint: 'radius', entity: 'arc', value: 5, at: [20, 17] },
      { key: 'points', constraint: 'points', entity: undefined, value: 10, at: [5, 0] },
      { key: 'entities', constraint: 'entities', entity: undefined, value: 15, at: [12.5, 7.5] },
    ]);
    expect(sketch).toEqual(before);
  });

  it('stacks glyphs by target and ignores dimensional constraints', () => {
    const sketch = mixedSketch();

    sketch.constraints = [
      { id: 'h', kind: 'horizontal', line: 'line' },
      { id: 'v', kind: 'vertical', line: 'line' },
      { id: 'join', kind: 'coincident', a: 'a', b: 'b' },
      ...dimensions,
    ];
    expect(constraintGlyphs(sketch, 2)).toEqual([
      { key: 'h-line', constraint: 'h', kind: 'horizontal', at: [5, -2] },
      { key: 'v-line', constraint: 'v', kind: 'vertical', at: [7.8, -2] },
      { key: 'join-a', constraint: 'join', kind: 'coincident', at: [0, -2] },
    ]);
  });

  it.each<PairKind>(['parallel', 'perpendicular', 'equal', 'tangent'])('places both %s targets', (kind) => {
    const sketch = mixedSketch();

    sketch.constraints = [{ id: 'pair', kind, a: 'circle', b: 'arc' }];
    expect(constraintGlyphs(sketch, 2)).toEqual([
      { key: 'pair-circle', constraint: 'pair', kind, at: [20, 13] },
      { key: 'pair-arc', constraint: 'pair', kind, at: [20, 15] },
    ]);
  });

  it('reads edits afresh and keeps previous results independent', () => {
    const sketch = mixedSketch();
    const before = dimensionLabels(sketch, ['arc'], 2);

    sketch.points[3].x = 26;
    sketch.points[3].y = 18;

    expect(dimensionLabels(sketch, ['arc'], 2)).toEqual([
      { key: 'measure-arc', entity: 'arc', value: 10, at: [20, 22] },
    ]);
    expect(hitTest(sketch, [20, 20], 0)).toEqual({ entity: 'arc' });
    expect(before).toEqual([{ key: 'measure-arc', entity: 'arc', value: 5, at: [20, 17] }]);

    sketch.constraints = [{ id: 'join', kind: 'coincident', a: 'c', b: 'a' }];

    const glyphs = constraintGlyphs(sketch, 2);

    glyphs[0].at[0] = -100;
    expect(constraintGlyphs(sketch, 2)[0].at).toEqual([20, 8]);
    expect(sketch.points[2].x).toBe(20);
  });

  it('retains last duplicate coordinates, missing-point fallback and empty results', () => {
    const sketch: Sketch = {
      points: [
        { id: 'same', x: 20, y: 0, fixed: true },
        { id: 'same', x: 4, y: 0, fixed: true },
      ],
      entities: [{ id: 'line', kind: 'line', a: 'same', b: 'missing' }],
      constraints: [{ id: 'join', kind: 'coincident', a: 'missing', b: 'same' }],
    };

    expect(hitTest(sketch, [2, 0], 0)).toEqual({ entity: 'line' });
    expect(hitTest(sketch, [10, 0], 0)).toBeNull();
    expect(dimensionLabels(sketch, ['line'], 0)[0]).toMatchObject({ value: 4, at: [2, 0] });
    expect(constraintGlyphs(sketch, 2)[0].at).toEqual([0, -2]);
    expect(hitTest({ points: [], entities: [], constraints: [] }, [0, 0], 1)).toBeNull();
    expect(dimensionLabels({ points: [], entities: [], constraints: [] }, [], 2)).toEqual([]);
    expect(constraintGlyphs({ points: [], entities: [], constraints: [] }, 2)).toEqual([]);
  });

  it.each([300, 600])('reads each point id once per query for %i entities', (count) => {
    const { sketch, reads } = countedSketch(count);

    expect(hitTest(sketch, [-1, 0], 0)).toEqual({ entity: 'e0' });
    expect(reads()).toBe(count);
    expect(dimensionLabels(sketch, [], 2)).toHaveLength(count);
    expect(reads()).toBe(count * 2);

    sketch.constraints = sketch.entities.map((e, i) => ({ id: `t${i}`, kind: 'tangent', a: e.id, b: e.id }));
    expect(constraintGlyphs(sketch, 2)).toHaveLength(count * 2);
    expect(reads()).toBe(count * 3);
  });

  it('leaves point coordinates unread when no marks or entity picks need them', () => {
    const { sketch, reads } = countedSketch(300);

    sketch.constraints = [];
    expect(dimensionLabels(sketch, [], 2)).toEqual([]);
    expect(constraintGlyphs(sketch, 2)).toEqual([]);
    expect(reads()).toBe(0);

    sketch.points[0].fixed = false;
    expect(hitTest(sketch, [0, 0], 0)).toEqual({ point: 'p0' });
    expect(reads()).toBe(1);
  });
});
