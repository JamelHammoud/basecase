import { describe, expect, it } from 'vitest';
import { GROUND_PLANE } from './placement';
import type { PartSketch } from './types';
import { supportRecordProblem } from './supportValidation';
import { withinSupportBudget } from './supportBudget';

function record(): PartSketch {
  return {
    mode: 'extrude',
    depth: 5,
    anchor: [0, 0],
    support: {
      version: 1,
      kind: 'planar-rectangle',
      partId: 'deck',
      normal: [0, 1, 0],
      frame: GROUND_PLANE,
      corners: ['r1', 'r2', 'r3', 'r4'],
      fingerprint: 'source',
    },
    sketch: {
      points: ['r1', 'r2', 'r3', 'r4'].map((id, i) => ({ id, x: i, y: i, fixed: true })),
      entities: ['r1', 'r2', 'r3', 'r4'].map((a, i) => ({
        id: `e${i + 1}`,
        kind: 'line' as const,
        a,
        b: ['r1', 'r2', 'r3', 'r4'][(i + 1) % 4],
        ref: true,
      })),
      constraints: [],
    },
  };
}

describe('saved supported Sketch validation', () => {
  it('accepts a bounded record and refuses broken reference identities before freshness shortcuts', () => {
    const good = record();

    expect(supportRecordProblem(good)).toBeNull();

    for (const bad of [
      null,
      {},
      { ...good, depth: NaN },
      { ...good, anchor: [0, Infinity] },
      { ...good, sketch: { ...good.sketch, points: [...good.sketch.points, good.sketch.points[0]] } },
      { ...good, sketch: { ...good.sketch, entities: [{ id: 'line', kind: 'line', a: 'r1', b: 'missing' }] } },
      { ...good, sketch: { ...good.sketch, entities: [{ id: 'circle', kind: 'circle', c: 'r1', r: Infinity }] } },
      { ...good, sketch: { ...good.sketch, constraints: [{ id: 'k1', kind: 'length', line: 'missing', value: 5 }] } },
      {
        ...good,
        sketch: { ...good.sketch, constraints: [{ id: 'k1', kind: 'distance', a: 'r1', b: 'r2', value: NaN }] },
      },
      { ...good, sketch: { ...good.sketch, points: good.sketch.points.slice(1) } },
    ])
      expect(supportRecordProblem(bad)).toBe('malformed');
  });

  it('refuses oversized input before serialization or numeric scanning', () => {
    expect(withinSupportBudget({ positions: new Array(10_000_000) })).toBe(false);
    expect(withinSupportBudget({ positions: [1, { text: 'x'.repeat(3_000_000) }] })).toBe(false);
    expect(withinSupportBudget({ positions: [0, 1, 2], name: 'Deck' })).toBe(true);

    const cycle: { next?: unknown } = {};

    cycle.next = cycle;
    expect(withinSupportBudget(cycle)).toBe(false);
  });
});
