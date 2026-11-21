import { describe, expect, it } from 'vitest';
import { addConstraint, applicableConstraints } from './edit';
import type { Sketch } from './types';

const sketch: Sketch = {
  points: [{ id: 'p', x: 0, y: 0 }],
  entities: [
    { id: 'line', kind: 'line', a: 'p', b: 'p' },
    { id: 'circle', kind: 'circle', c: 'p', r: 5 },
    { id: 'arc', kind: 'arc', c: 'p', a: 'p', b: 'p' },
  ],
  constraints: [],
};

describe('Sketch constraint eligibility', () => {
  it('keeps single-item and pair rules, including missing and repeated ids', () => {
    const cases: Array<{ ids: string[]; expected: string[] }> = [
      { ids: ['line'], expected: ['horizontal', 'vertical'] },
      { ids: ['circle'], expected: [] },
      { ids: ['arc'], expected: [] },
      { ids: ['p'], expected: [] },
      { ids: ['missing'], expected: [] },
      { ids: ['line', 'line'], expected: ['parallel', 'perpendicular', 'equal'] },
      { ids: ['circle', 'arc'], expected: ['equal', 'tangent'] },
      { ids: ['arc', 'arc'], expected: ['equal', 'tangent'] },
      { ids: ['line', 'circle'], expected: ['tangent'] },
      { ids: ['line', 'arc'], expected: ['tangent'] },
      { ids: ['p', 'line'], expected: ['coincident'] },
      { ids: ['p', 'circle'], expected: ['coincident'] },
      { ids: ['p', 'p'], expected: ['coincident'] },
      { ids: ['p', 'missing'], expected: ['coincident'] },
      { ids: ['line', 'missing'], expected: [] },
      { ids: ['missing', 'missing'], expected: [] },
      { ids: [], expected: [] },
      { ids: ['line', 'circle', 'p'], expected: [] },
    ];

    for (const { ids, expected } of cases) {
      expect(applicableConstraints(sketch, ids)).toEqual(expected);
      expect(applicableConstraints(sketch, ids.toReversed())).toEqual(expected);
    }
  });

  it.each([300, 600])('rejects unsupported selections without reading %i entities', (count) => {
    let reads = 0;
    const entities: Sketch['entities'] = Array.from({ length: count }, (_, i) => ({
      get id() {
        reads += 1;

        return `l${i}`;
      },
      kind: 'line',
      a: 'p',
      b: 'p',
    }));
    const source = { ...sketch, entities };
    const ids = Array.from({ length: count }, (_, i) => `l${i}`);

    expect(applicableConstraints(source, ids)).toEqual([]);
    expect(addConstraint(source, 'parallel', ids)).toBeNull();
    expect(reads).toBe(0);
    expect(applicableConstraints(source, ['l0'])).toEqual(['horizontal', 'vertical']);
    expect(reads).toBe(1);
    expect(source.entities).toBe(entities);
    expect(ids).toHaveLength(count);
  });
});
