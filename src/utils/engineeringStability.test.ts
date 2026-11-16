import { describe, expect, it } from 'vitest';
import { box, part, project } from './engineering.fixtures';
import { stabilityOf } from './engineeringStability';
import type { CheckContext } from './engineeringTypes';

function context(count: number): CheckContext {
  const foot = part('foot');
  const settings = project();
  const measures = { foot: box([-100, 0, -100], [100, 10, 100]) };
  const mass = { grams: 100, com: [0, 20, 0] as [number, number, number] };

  return {
    input: { parts: [foot], measures, project: settings, servoOutputs: {} },
    parts: [foot],
    project: settings,
    measures,
    joints: [],
    byPart: new Map([['foot', foot]]),
    byId: new Map(),
    all: mass,
    onFloor: [foot],
    servos: [],
    bodies: Array.from({ length: count }, (_, i) => ({
      key: `body${i}`,
      joints: [],
      parts: new Set(['foot']),
      mass: { grams: i % 7 === 3 ? 0 : 100, com: [(i * 37) % 300, i + 1, 0] },
      feet: i % 11 === 4 ? [] : [foot],
      legged: false,
    })),
  };
}

function sortedResult(ctx: CheckContext) {
  return ctx.bodies
    .flatMap((body) => stabilityOf({ ...ctx, bodies: [body] }) ?? [])
    .sort((a, b) => a.marginMm - b.marginMm)[0];
}

describe('Standing stability across robots', () => {
  it('matches ordered selection through generated bodies, source reversal and edits', () => {
    for (let count = 0; count < 80; count++) {
      const ctx = context(count);
      const before = structuredClone(ctx);

      expect(stabilityOf(ctx)).toEqual(sortedResult(ctx));
      expect(ctx).toEqual(before);
      ctx.bodies.reverse();
      expect(stabilityOf(ctx)).toEqual(sortedResult(ctx));

      for (const body of ctx.bodies) body.mass.com[0] -= 75;

      expect(stabilityOf(ctx)).toEqual(sortedResult(ctx));
    }
  });

  it('keeps the first equal margin and omits bodies without mass or contacts', () => {
    const ctx = context(4);

    for (const body of ctx.bodies) body.mass.com[0] = 110;

    expect(stabilityOf(ctx)).toMatchObject({ marginMm: -10, heightMm: 1 });
    ctx.bodies.reverse();
    expect(stabilityOf(ctx)).toMatchObject({ marginMm: -10, heightMm: 3 });

    for (const body of ctx.bodies) body.feet = [];

    expect(stabilityOf(ctx)).toBeUndefined();
  });

  it('retains sorting behavior for nonfinite mass coordinates', () => {
    const ctx = context(40);

    for (const value of [NaN, Infinity, -Infinity]) {
      ctx.bodies[8].mass.com[0] = value;
      expect(stabilityOf(ctx)).toEqual(sortedResult(ctx));
      ctx.bodies.reverse();
      expect(stabilityOf(ctx)).toEqual(sortedResult(ctx));
    }
  });
});
