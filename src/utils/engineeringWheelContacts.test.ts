import { describe, expect, it } from 'vitest';
import type { RobotJoint } from '../types/robotics';
import { box, joint, part, project, type Measures } from './engineering.fixtures';
import { stabilityOf } from './engineeringStability';
import type { CheckContext } from './engineeringTypes';

function context(joints: RobotJoint[]): CheckContext {
  const parts = [part('wheel'), part('caster')];
  const measures: Measures = {
    wheel: box([-50, 0, -50], [50, 100, 50]),
    caster: { ...box([100, 0, 0], [101, 1, 1]), base: [[100, 0]] },
  };
  const mass = { grams: 100, com: [20, 10, 0] as [number, number, number] };
  const settings = project({ joints });

  return {
    input: { parts, measures, project: settings, servoOutputs: {} },
    parts,
    project: settings,
    measures,
    joints,
    byPart: new Map(parts.map((p) => [p.id, p])),
    byId: new Map(),
    all: mass,
    onFloor: parts,
    servos: [],
    bodies: [{ key: 'robot', joints, parts: new Set(parts.map((p) => p.id)), mass, feet: parts, legged: false }],
  };
}

const axle = (id: string, options: Partial<RobotJoint> = {}) =>
  joint(id, { child: ['wheel'], origin: [0, 50, 0], ...options });

describe('Wheel hinge contact classification', () => {
  it('keeps the first qualifying axis and rebuilds ownership after edits', () => {
    const x = axle('x', { child: ['wheel', 'wheel', 'other'] });
    const z = axle('z', { axis: [0, 0, -3] });
    const ctx = context([x, z]);
    const before = structuredClone(ctx.joints);

    expect(stabilityOf(ctx)?.onALine).toBe(true);
    expect(ctx.joints).toEqual(before);

    x.child = ['other'];

    expect(stabilityOf(ctx)?.onALine).toBe(false);

    x.child = ['wheel'];
    ctx.joints.reverse();

    expect(stabilityOf(ctx)?.onALine).toBe(false);
  });

  it.each([
    { type: 'prismatic' as const },
    { child: ['other'] },
    { axis: [0, 1, 0] as [number, number, number] },
    { axis: [0, 0, 0] as [number, number, number] },
    { axis: [1, 1, 0] as [number, number, number] },
    { origin: [0, 61, 0] as [number, number, number] },
  ])('ignores a nonqualifying hinge before the matching axle: %j', (options) => {
    const ctx = context([axle('rejected', options), axle('accepted', { axis: [0, 0, 5] })]);

    expect(stabilityOf(ctx)).toEqual(stabilityOf(context([axle('accepted', { axis: [0, 0, 5] })])));
    expect(stabilityOf(ctx)?.onALine).toBe(false);
  });

  it('preserves roundness and centerline tolerances and falls back to measured bases', () => {
    const ctx = context([axle('x', { origin: [0, 60, 0] })]);

    expect(stabilityOf(ctx)?.onALine).toBe(true);

    ctx.joints[0].origin[1] = 60.01;

    expect(stabilityOf(ctx)?.onALine).toBe(false);

    ctx.joints[0].origin[1] = 50;
    ctx.measures.wheel!.max[2] = 61;

    expect(stabilityOf(ctx)?.onALine).toBe(false);

    ctx.measures.wheel!.base = [[0, 0]];

    expect(stabilityOf(ctx)?.onALine).toBe(true);
  });

  it('indexes one hinge for every child across separate bodies', () => {
    const ctx = context([axle('shared', { child: ['wheel', 'second'] })]);
    const second = part('second');

    ctx.measures.second = ctx.measures.wheel;
    ctx.bodies.push({ ...ctx.bodies[0], key: 'second', feet: [second] });

    expect(stabilityOf(ctx)?.onALine).toBe(true);
    expect(ctx.bodies.map((body) => stabilityOf({ ...ctx, bodies: [body] })?.onALine)).toEqual([true, true]);

    ctx.joints[0].child = [];

    expect(stabilityOf(ctx)?.onALine).toBe(false);
    expect(ctx.bodies.map((body) => stabilityOf({ ...ctx, bodies: [body] })?.onALine)).toEqual([false, false]);
  });
});
