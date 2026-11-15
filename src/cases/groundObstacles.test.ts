import { describe, expect, it, vi } from 'vitest';
import type { V3 } from '../utils/kinematics';
import { groundObstacles } from './groundObstacles';
import { groundRoute } from './groundRoute';
import type { Room } from './roomPlan';
import { openSpot, tappedStart } from './roomWorld';
import type { WorldObject } from './schema';

const block = (position: V3 = [0, 75, 450]): WorldObject => ({
  id: 'block',
  name: 'Block',
  kind: 'box',
  position,
  rotation: [0, 0, 0],
  size: [150, 150, 120],
  color: '#6e6e6e',
  behavior: 'static',
});

describe('prepared ground obstacles', () => {
  it.each([
    { rotation: [0, 0, 0], halfX: 175, halfZ: 160 },
    { rotation: [1e-6, -1e-6, 0], halfX: 175, halfZ: 160 },
    { rotation: [0, 1.01e-6, 0], halfX: Math.hypot(150, 120) / 2 + 100, halfZ: Math.hypot(150, 120) / 2 + 100 },
    { rotation: [90, 0, -45], halfX: Math.hypot(150, 120) / 2 + 100, halfZ: Math.hypot(150, 120) / 2 + 100 },
  ])('keeps strict footprint boundaries for rotation $rotation', ({ rotation, halfX, halfZ }) => {
    const object = { ...block([10, 75, -20]), rotation: rotation as V3 };
    const before = structuredClone(object);
    const obstacles = groundObstacles([object], 100);

    for (const dx of [-halfX - 1e-6, -halfX, -halfX + 1e-6, 0, halfX - 1e-6, halfX, halfX + 1e-6])
      for (const dz of [-halfZ - 1e-6, -halfZ, -halfZ + 1e-6, 0, halfZ - 1e-6, halfZ, halfZ + 1e-6])
        expect(obstacles.occupied([10 + dx, -1000, -20 + dz])).toBe(Math.abs(dx) < halfX && Math.abs(dz) < halfZ);

    expect(object).toEqual(before);
  });

  it.each([
    { startZ: 0, rect: { minX: -175, maxX: 175, minZ: 290, maxZ: 610 } },
    { startZ: 290, rect: { minX: -175, maxX: 175, minZ: 290, maxZ: 610 } },
    { startZ: 300, rect: { minX: -125, maxX: 125, minZ: 340, maxZ: 560 } },
    { startZ: 350, rect: { minX: -100, maxX: 100, minZ: 365, maxZ: 535 } },
    { startZ: 380, rect: { minX: -75, maxX: 75, minZ: 390, maxZ: 510 } },
    { startZ: 450, rect: undefined },
  ])('selects the first clearance level outside both endpoints at $startZ', ({ startZ, rect }) => {
    const obstacles = groundObstacles([block()], 100);
    const start: V3 = [0, 0, startZ];
    const end: V3 = [0, 0, 900];

    expect(obstacles.blocker(start, end)).toEqual(rect);
    expect(obstacles.blocker(end, start)).toEqual(rect);
    expect(obstacles.blocker(start, start)).toBeUndefined();
  });

  it('preserves parallel tolerances, grazing edges and first-obstacle order with duplicate ids', () => {
    const obstacles = groundObstacles([block(), block([0, 75, 250])], 100);

    expect(obstacles.blocker([0, 0, 0], [0, 0, 900])?.minZ).toBe(290);
    expect(obstacles.blocker([175, 0, 0], [175, 0, 900])).toBeUndefined();
    expect(obstacles.blocker([175 - 1e-6, 0, 0], [175 - 1e-6, 0, 900])?.minZ).toBe(290);
    expect(obstacles.blocker([175, 0, 0], [175 - 0.5e-9, 0, 900])).toBeUndefined();
    expect(obstacles.blocker([175, 0, 0], [175 - 2e-9, 0, 900])?.minZ).toBe(290);
    expect(obstacles.blocker([-300, 0, 290], [300, 0, 290])?.minZ).toBe(90);
    expect(groundObstacles([], 100).occupied([0, 0, 0])).toBe(false);
    expect(groundObstacles([], 100).blocker([0, 0, 0], [0, 0, 900])).toBeUndefined();
  });

  it('prepares each reached clearance level once and reads edits in the next query', () => {
    const object = block();
    const far = block([1000, 75, 450]);
    const obstacles = groundObstacles([object, far], 100);
    const rotation = vi.spyOn(object.rotation, 'some');
    const farRotation = vi.spyOn(far.rotation, 'some');

    expect(rotation).not.toHaveBeenCalled();
    expect(obstacles.occupied([0, 0, 450])).toBe(true);
    expect(rotation).toHaveBeenCalledTimes(1);

    for (let repeat = 0; repeat < 20; repeat++) {
      expect(obstacles.blocker([0, 0, 380], [0, 0, 900])?.minZ).toBe(390);
      expect(obstacles.occupied([0, 0, 450])).toBe(true);
    }

    expect(rotation).toHaveBeenCalledTimes(4);
    expect(farRotation).not.toHaveBeenCalled();
    rotation.mockRestore();
    farRotation.mockRestore();
    object.position = [500, 75, 450];
    expect(groundObstacles([object, far], 100).blocker([0, 0, 0], [0, 0, 900])).toBeUndefined();
    object.position = [0, 75, 450];
    expect(groundObstacles([object, far], 50).blocker([0, 0, 0], [0, 0, 900])?.minX).toBe(-125);
  });
});

describe('ground planning footprint reuse', () => {
  it.each([10, 20])('shares footprints across %i waypoints and their detours', (count) => {
    const object = block();
    const rotation = vi.spyOn(object.rotation, 'some');
    const robot = { start: [0, 0, 0] as V3, clearanceMm: 100 };
    const waypoints = Array.from({ length: count }, (_, index) => ({
      at: [0, 0, index % 2 ? 0 : 900] as V3,
      speed: 0.3,
    }));
    const route = groundRoute(waypoints, [object], robot);
    const preparations = rotation.mock.calls.length;

    rotation.mockRestore();
    expect(preparations).toBe(1);
    expect(route).toEqual(
      waypoints.flatMap((point, index) => [
        { ...point, at: [-201.25, 0, index % 2 ? 634 : 266] },
        { ...point, at: [-201.25, 0, index % 2 ? 266 : 634] },
        point,
      ]),
    );
    object.position = [1000, 75, 450];
    expect(groundRoute(waypoints, [object], robot)).toEqual(waypoints);
    object.position = [0, 75, 450];
    expect(groundRoute(waypoints, [object], robot)).toEqual(route);
  });

  it('prepares no footprints for empty and push-only routes', () => {
    const object = block();
    const rotation = vi.spyOn(object.rotation, 'some');
    const robot = { start: [0, 0, 0] as V3, clearanceMm: 100 };
    const push = { at: [0, 0, 900] as V3, push: object.id };

    expect(groundRoute([], [object], robot)).toEqual([]);
    expect(groundRoute([push], [object], robot)).toEqual([push]);
    expect(rotation).not.toHaveBeenCalled();
    rotation.mockRestore();
  });

  it('shares footprints across room start candidates and rechecks a moved obstacle', () => {
    const object = { ...block([0, 75, 0]), size: [500, 150, 500] as V3 };
    const marker = { ...block([0, 0, 0]), size: [2000, 0, 2000] as V3, behavior: 'marker' as const };
    const room: Room = { name: 'Room', objects: [object, marker], doors: [], start: { at: [0, 0, 0], heading: 0 } };
    const rotation = vi.spyOn(object.rotation, 'some');
    const start = openSpot(room, 100);
    const preparations = rotation.mock.calls.length;

    rotation.mockRestore();
    expect(start).toEqual([-350, 0, 0]);
    expect(preparations).toBe(1);
    expect(tappedStart(room, 100)).toBeUndefined();
    object.position = [700, 75, 700];
    expect(openSpot(room, 100)).toEqual([0, 0, 0]);
    expect(tappedStart(room, 100)).toEqual(room.start);
  });
});
