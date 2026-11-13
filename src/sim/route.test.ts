import { describe, expect, it } from 'vitest';
import { limitedCommand, routeAt, routeCommand, wheelSpeeds, type RouteSpec } from './route';

const spec = (over: Partial<RouteSpec> = {}): RouteSpec => ({
  keys: [
    { t: 0, forward: 0, left: 0 },
    { t: 4, forward: 0.4, left: 0 },
    { t: 6, forward: 0.4, left: 0 },
  ],
  gain: 2,
  headingGain: 2,
  deadband: 0.005,
  limits: { forward: [-0.2, 0.2], left: [-0.05, 0.05], turn: 1 },
  ...over,
});

describe('route', () => {
  it('interpolates the goal and its speed between keys, and holds after the last', () => {
    const mid = routeAt(spec().keys, 2);

    expect(mid.at.forward).toBeCloseTo(0.2);
    expect(mid.velocity.forward).toBeCloseTo(0.1);
    expect(routeAt(spec().keys, 9)).toEqual({ at: { forward: 0.4, left: 0 }, velocity: { forward: 0, left: 0 } });
  });

  it('commands the feed-forward speed plus a pull toward the goal, in the body frame', () => {
    const [forward, left, turn] = routeCommand(spec(), { t: 2, at: { forward: 0.15, left: 0 }, yaw: 0 });

    expect(forward).toBeCloseTo(0.1 + 2 * 0.05);
    expect(left).toBeCloseTo(0);
    expect(turn).toBeCloseTo(0);
  });

  it('stops inside the deadband once the route is over', () => {
    expect(routeCommand(spec(), { t: 7, at: { forward: 0.398, left: 0 }, yaw: 0 })).toEqual([0, 0, 0]);
  });

  it('turns to face a goal it can’t reach sideways, and backs up when only reverse is allowed', () => {
    const sideways = spec({
      keys: [
        { t: 0, forward: 0, left: 0 },
        { t: 1, forward: 0, left: 0.3 },
      ],
      limits: { forward: [-0.2, 0.2], left: [0, 0], turn: 1 },
    });
    const [, , turn] = routeCommand(sideways, { t: 2, at: { forward: 0, left: 0 }, yaw: 0 });

    expect(turn).toBeGreaterThan(0);

    const reverse = spec({ limits: { forward: [-0.2, 0], left: [0, 0], turn: 1 } });
    const backing = routeCommand(reverse, { t: 5, at: { forward: 0.1, left: 0 }, yaw: Math.PI });

    expect(backing[0]).toBeLessThan(0);
  });

  it('limits how fast the command changes', () => {
    const limited = limitedCommand(spec({ accel: { forward: 0.5, turn: 2 } }), {
      want: [0.2, 0, 1],
      last: [0, 0, 0],
      dt: 0.02,
    });

    expect(limited).toEqual([0.01, 0, 0.04]);
  });

  it('turns wheels by their side, radius and spin', () => {
    const wheels = [
      { joint: 'l', spin: 1, lateralMm: 85, radiusMm: 35 },
      { joint: 'r', spin: -1, lateralMm: -85, radiusMm: 35 },
    ];
    const speeds = wheelSpeeds(wheels, [0.07, 0, 1]);

    expect(speeds.l).toBeCloseTo((70 - 85) / 35);
    expect(speeds.r).toBeCloseTo(-(70 + 85) / 35);
  });
});
