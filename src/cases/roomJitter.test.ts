import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { quatToMj } from '../sim/mjcfFrames';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildRig, partMatrix } from '../utils/kinematics';
import { buildCase, builderRobot } from './caseBuilder';
import { jitteredWorld, worldRandom } from './caseRandom';
import { fixtureRoom } from './roomFixture';
import { clearOfStart, footprint, gapBetween, overlap, startBox } from './roomJitter';
import { readRoomPlan } from './roomPlan';
import { worldItem, type Case, type WorldObject } from './schema';
import { turnedQuat, worldOffsets } from './tryReplay';

const rover = (() => {
  const r = fixtureRobots().find((f) => f.id === 'rover-diff')!;

  return builderRobot(buildRig(r.joints, r.parts), r.parts);
})();

const room = readRoomPlan(JSON.stringify(fixtureRoom()), 'Fixture Flat.json');

const kase = (() => {
  const result = buildCase({ goal: 'reach', world: 'room', room, targets: ['Under Table'] }, rover);

  if (!result.ok) throw new Error(result.problem);

  return result.kase;
})();

const SEEDS = Array.from({ length: 50 }, (_, i) => i + 1);

const layout = (seed: number) => jitteredWorld(kase, worldRandom(seed)).world.objects;

const byId = (objects: WorldObject[], id: string) => objects.find((o) => o.id === id)!;

const walls = (c: Case) => c.world.objects.filter((o) => o.name === 'Wall');

describe('furniture jitter in a room', () => {
  it('never moves walls, and leaves the doorways where they are', () => {
    for (const seed of SEEDS) expect(layout(seed).filter((o) => o.name === 'Wall')).toEqual(walls(kase));
  });

  it('moves each static piece within its tolerance, never further into a wall or onto the start box', () => {
    const fixed = walls(kase).map(footprint);
    const start = startBox(rover);

    for (const seed of SEEDS)
      for (const moved of layout(seed).filter((o) => o.jitter)) {
        const was = byId(kase.world.objects, moved.id);
        const { mm, deg } = was.jitter!;

        expect(Math.abs(moved.position[0] - was.position[0])).toBeLessThanOrEqual(mm);
        expect(Math.abs(moved.position[2] - was.position[2])).toBeLessThanOrEqual(mm);
        expect(Math.abs(moved.rotation[1] - was.rotation[1])).toBeLessThanOrEqual(deg);
        fixed.forEach((wall) =>
          expect(overlap(footprint(moved), wall)).toBeLessThanOrEqual(overlap(footprint(was), wall) + 1),
        );
        expect(gapBetween(footprint(moved), start)).toBeGreaterThanOrEqual(0);
      }
  });

  it('gives the same layout for the same seed, and another for another', () => {
    expect(layout(3)).toEqual(layout(3));
    expect(byId(layout(3), 'table-1').position).not.toEqual(byId(layout(4), 'table-1').position);
    expect(byId(layout(3), 'sofa-1').rotation).not.toEqual(byId(layout(4), 'sofa-1').rotation);
  });

  it('narrows a piece’s jitter so it can’t reach the start box, and drops it when there is no room', () => {
    const start = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
    const piece = (x: number): WorldObject => ({
      id: 'table-1',
      name: 'Table',
      kind: 'box',
      position: [x, 730, 0],
      rotation: [0, 0, 0],
      size: [400, 40, 400],
      color: '#6e6e6e',
      behavior: 'static',
      jitter: { mm: 50, deg: 5 },
    });
    const [near, touching, far] = clearOfStart([piece(360), piece(300), piece(1000)], start);
    const sweep = near.jitter!.mm + (Math.hypot(400, 400) / 2) * ((near.jitter!.deg * Math.PI) / 180);

    expect(sweep).toBeLessThanOrEqual(60);
    expect(near.jitter!.mm).toBeGreaterThan(0);
    expect(touching.jitter).toBeUndefined();
    expect(far.jitter).toEqual({ mm: 50, deg: 5 });
  });

  it('hands Multiply each piece’s move and turn, turned the way the MuJoCo writer turns it', () => {
    const offsets = worldOffsets(kase, 3);
    const table = offsets.get('table-1')!;
    const turned: WorldObject = { ...byId(kase.world.objects, 'table-1'), rotation: [0, table.turnDeg, 0] };
    const written = quatToMj(new THREE.Quaternion().setFromRotationMatrix(partMatrix(worldItem(turned))));

    expect([...offsets.keys()].some((id) => id.startsWith('wall'))).toBe(false);
    expect(table.turnDeg).not.toBe(0);
    turnedQuat([1, 0, 0, 0], table.turnDeg).forEach((q, i) => expect(q).toBeCloseTo(written[i], 9));
  });
});
