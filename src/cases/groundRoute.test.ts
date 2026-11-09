import { describe, expect, it } from 'vitest';
import type { V3 } from '../utils/kinematics';
import { groundRoute } from './groundRoute';
import type { WorldObject } from './schema';

const block = (position: V3, size: V3, behavior: WorldObject['behavior'] = 'static'): WorldObject => ({
  id: 'block',
  name: 'Block',
  kind: 'box',
  position,
  rotation: [0, 0, 0],
  size,
  color: '#6e6e6e',
  behavior,
});

const robot = { start: [0, 0, 0] as V3, clearanceMm: 100 };

describe('ground routes', () => {
  it('goes straight when nothing is in the way', () => {
    expect(groundRoute([{ at: [0, 0, 900] }], [], robot)).toEqual([{ at: [0, 0, 900] }]);
  });

  it('detours past the side of a block in the way, clear of it, and still ends on the waypoint', () => {
    const route = groundRoute([{ at: [0, 0, 900] }], [block([0, 75, 450], [150, 150, 120])], robot);
    const detour = route.slice(0, -1).map((p) => p.at);

    expect(route.at(-1)!.at).toEqual([0, 0, 900]);
    expect(detour).toHaveLength(2);
    expect(detour.every((p) => Math.abs(p[0]) > 75 + 100)).toBe(true);
    expect(detour[0][2]).toBeLessThan(450 - 60 - 100);
    expect(detour[1][2]).toBeGreaterThan(450 + 60 + 100);
  });

  it('ignores markers and dynamic objects, and keeps a waypoint’s speed and pushed object', () => {
    const objects = [block([0, 75, 450], [150, 150, 120], 'marker'), block([0, 75, 600], [150, 150, 150], 'dynamic')];
    const push = { at: [0, 75, 900] as V3, speed: 0.3, push: 'box' };

    expect(groundRoute([{ at: [0, 0, 300] }, push], objects, robot)).toEqual([{ at: [0, 0, 300] }, push]);
  });

  it('reaches a waypoint that sits inside the grown block by growing it less', () => {
    const route = groundRoute([{ at: [0, 0, 600] }], [block([0, 75, 450], [150, 150, 120])], robot);

    expect(route.at(-1)!.at).toEqual([0, 0, 600]);
    expect(route.length).toBeGreaterThan(1);
  });
});
