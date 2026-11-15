import { describe, expect, it, vi } from 'vitest';
import type { ScenePart } from '../types/robotics';
import { boxCenter, boxContains, boxVolume, sub } from './guideMath';
import { boxOfPart, isCover, orderMajors, touching, type PlanContext } from './guideOrder';
import type { Box, V3 } from './guideTypes';

function scannedChoice(ctx: PlanContext, candidates: string[], anchor: Set<string> | null) {
  if (!anchor) {
    return candidates.reduce((a, b) => (boxVolume(boxOfPart(ctx, b)) > boxVolume(boxOfPart(ctx, a)) ? b : a));
  }

  const score = (id: string) => [
    touching(ctx, id).filter((other) => anchor.has(other)).length,
    -Math.round(
      Math.min(
        ...[...anchor].map((other) =>
          Math.hypot(...sub(boxCenter(boxOfPart(ctx, id)), boxCenter(boxOfPart(ctx, other)))),
        ),
      ) / 5,
    ),
    -boxOfPart(ctx, id).min[1],
    boxVolume(boxOfPart(ctx, id)),
  ];
  const better = (a: number[], b: number[]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3];

  return candidates.reduce((best, id) => (better(score(id), score(best)) > 0 ? id : best));
}

function scannedHeuristic(ctx: PlanContext, majors: string[], outside: Set<string>) {
  const enclosed = new Map(
    majors.map((id) => {
      const box = boxOfPart(ctx, id);
      const inside = (other: string) =>
        other !== id &&
        boxVolume(boxOfPart(ctx, other)) < boxVolume(box) * 0.5 &&
        boxContains(box, boxCenter(boxOfPart(ctx, other)));

      return [id, isCover(ctx.byId.get(id)!) ? majors.filter(inside) : []];
    }),
  );
  const placed = new Set<string>();
  const order: string[] = [];

  while (order.length < majors.length) {
    const open = majors.filter((id) => !placed.has(id));
    const ready = open.filter((id) => enclosed.get(id)!.every((inner) => placed.has(inner)));
    const pool = ready.length ? ready : open;
    const frames = pool.filter((id) => !isCover(ctx.byId.get(id)!));
    const initial = outside.size ? outside : null;
    const next = scannedChoice(ctx, frames.length ? frames : pool, order.length ? placed : initial);

    placed.add(next);
    order.push(next);
  }

  return order;
}

function scannedOrder(ctx: PlanContext, majors: string[], outside: Set<string>) {
  const rank = ctx.order?.rank;

  if (!rank) return scannedHeuristic(ctx, majors, outside);

  const proven = majors.filter((id) => rank.has(id)).sort((a, b) => rank.get(a)! - rank.get(b)!);

  return [
    ...scannedHeuristic(
      ctx,
      majors.filter((id) => !rank.has(id)),
      outside,
    ),
    ...proven,
  ];
}

function context(boxes: Record<string, Box>, names: Record<string, string> = {}): PlanContext {
  const parts = Object.keys(boxes).map((id): ScenePart => ({
    id,
    name: names[id] ?? id,
    kind: 'box',
    category: 'structure',
    role: 'solid',
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    dimensions: { width: 10, height: 10, depth: 10 },
    color: '#eeeeee',
    note: '',
    visible: true,
    locked: false,
  }));

  return { byId: new Map(parts.map((part) => [part.id, part])), boxes, contacts: {}, axes: {}, size: 100 };
}

const box = (center: V3, radius = 5): Box => ({
  min: center.map((value) => value - radius) as V3,
  max: center.map((value) => value + radius) as V3,
});

describe('build guide placement scoring', () => {
  it('drops outside anchors after the first placement and counts repeated, directed contacts', () => {
    const ctx = context({ outside: box([0, 0, 0]), a: box([10, 0, 0]), b: box([-15, 0, 0]), c: box([30, 0, 0]) });
    const majors = ['b', 'c', 'a'];
    const outside = new Set(['outside']);

    expect(orderMajors(ctx, majors, outside)).toEqual(['a', 'c', 'b']);

    ctx.contacts = { b: ['a', 'a', 'unknown'], c: ['a'], a: ['c'] };

    expect(orderMajors(ctx, majors, outside)).toEqual(['a', 'b', 'c']);
    expect(orderMajors(ctx, majors, outside)).toEqual(scannedOrder(ctx, majors, outside));
  });

  it('keeps source ties, cover dependencies, missing boxes and proven ranks', () => {
    const ctx = context(
      { lid: box([0, 0, 0], 30), a: box([0, 0, 0]), b: box([0, 0, 0]), far: box([100, 0, 0]) },
      { lid: 'Case lid' },
    );
    const majors = ['lid', 'b', 'a', 'far'];

    expect(orderMajors(ctx, majors, new Set())).toEqual(['b', 'a', 'far', 'lid']);
    expect(orderMajors(ctx, [], new Set(['unknown']))).toEqual([]);

    delete ctx.boxes.a;
    ctx.order = {
      rank: new Map([
        ['far', 2],
        ['b', 1],
      ]),
      unproven: new Set(['a']),
    };

    expect(orderMajors(ctx, majors, new Set(['a', 'unknown']))).toEqual(
      scannedOrder(ctx, majors, new Set(['a', 'unknown'])),
    );
    expect(orderMajors(ctx, majors, new Set()).slice(-2)).toEqual(['b', 'far']);
    expect(orderMajors(ctx, ['b', 'far'], new Set())).toEqual(['b', 'far']);
  });

  it('matches complete scanned orders across seeded scenes and later edits without changing inputs', () => {
    let seed = 813;
    const next = (limit: number) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;

      return seed % limit;
    };

    for (let trial = 0; trial < 120; trial++) {
      const ids = Array.from({ length: 4 + next(20) }, (_, i) => `part-${i}`);
      const boxes = Object.fromEntries(
        ids.map((id) => [id, box([next(21) - 10, next(21) - 10, next(21) - 10], 1 + next(15))]),
      );
      const ctx = context(boxes, Object.fromEntries(ids.filter(() => next(4) === 0).map((id) => [id, 'Cover'])));

      ctx.contacts = Object.fromEntries(
        ids.map((id) => [id, Array.from({ length: next(10) }, () => ids[next(ids.length)])]),
      );

      const majors = ids.slice(0, -2);
      const outside = new Set(trial % 3 ? ids.slice(-2) : []);

      if (trial % 4 === 0)
        ctx.order = {
          rank: new Map([
            [majors[1], 1],
            [majors[0], 1],
          ]),
          unproven: new Set(),
        };

      const before = structuredClone({ ctx, majors, outside });

      expect(orderMajors(ctx, majors, outside)).toEqual(scannedOrder(ctx, majors, outside));
      expect({ ctx, majors, outside }).toEqual(before);

      ctx.boxes[majors[0]] = box([100, -50, 10]);
      ctx.contacts[majors[1]] = [majors[0], majors[0]];
      majors.reverse();

      expect(orderMajors(ctx, majors, outside)).toEqual(scannedOrder(ctx, majors, outside));
    }
  });

  it.each([40, 80])('measures each remaining pair once across %i placements', (count) => {
    const ids = Array.from({ length: count }, (_, i) => `part-${i}`);
    const ctx = context(Object.fromEntries(ids.map((id, i) => [id, box([i * 10, 0, 0])])));
    let contactReads = 0;

    for (const id of ids) {
      Object.defineProperty(ctx.contacts, id, {
        get() {
          contactReads++;

          return [];
        },
      });
    }

    const hypot = vi.spyOn(Math, 'hypot');

    try {
      const expected = scannedOrder(ctx, ids, new Set());

      expect(hypot).toHaveBeenCalledTimes((count * (count - 1) * (count - 2)) / 3);
      expect(contactReads).toBe((count - 1) * (count - 2));
      hypot.mockClear();
      contactReads = 0;
      expect(orderMajors(ctx, ids, new Set())).toEqual(expected);
      expect(hypot).toHaveBeenCalledTimes((count * (count - 1)) / 2);
      expect(contactReads).toBe(count);
    } finally {
      hypot.mockRestore();
    }
  });
});
