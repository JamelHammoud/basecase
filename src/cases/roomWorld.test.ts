import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildRig, type V3 } from '../utils/kinematics';
import { buildCase, builderRobot, caseName, worldsFor, type CaseSpec } from './caseBuilder';
import { routeClearance } from './caseGoals';
import { FIXTURE_DOOR, FIXTURE_START_MM, fixtureRoom } from './roomFixture';
import { readRoomPlan } from './roomPlan';
import { openSpot, tableInReach } from './roomWorld';
import { scaledToReach } from './scale';
import type { Case } from './schema';
import { runCase } from './testing';

const fixture = (id: string) => fixtureRobots().find((r) => r.id === id)!;

const robotOf = (id: string) => {
  const r = fixture(id);

  return builderRobot(buildRig(r.joints, r.parts), r.parts);
};

const room = readRoomPlan(JSON.stringify(fixtureRoom()), 'Fixture Flat.json');

const withTableBeside = () => ({
  ...room,
  objects: room.objects.map((o) =>
    o.name === 'Table' ? { ...o, position: [FIXTURE_START_MM[0], o.position[1], FIXTURE_START_MM[2] + 600] as V3 } : o,
  ),
});

const THROUGH_DOOR = { distanceMm: 2000, radiusMm: 250, seconds: 14 };

function built(id: string, spec: Omit<CaseSpec, 'room' | 'world'>): Case {
  const result = buildCase({ ...spec, world: 'room', room }, robotOf(id));

  if (!result.ok) throw new Error(result.problem);

  return result.kase;
}

describe('a room world', () => {
  it('offers the ground goals, and arm goals only with a table in reach', () => {
    const rover = robotOf('rover-diff');
    const arm = robotOf('arm-6dof');
    const offered = (goal: 'reach' | 'push' | 'path' | 'walk' | 'touch', robot = rover) =>
      worldsFor(goal, robot, room).some((w) => w.kind === 'room');

    expect(['reach', 'push', 'path'].map((g) => offered(g as 'reach'))).toEqual([true, true, true]);
    expect(offered('walk')).toBe(false);
    expect(offered('touch', arm)).toBe(false);
    expect(tableInReach(withTableBeside(), arm)).toBe(true);
  });

  it('starts the robot on the open floor nearest the middle of the room', () => {
    expect(openSpot(room, routeClearance(robotOf('rover-diff')))).toEqual(FIXTURE_START_MM);
  });

  it('names the Case after the room, keeps its true size and routes through the doorway', () => {
    const rover = robotOf('rover-diff');
    const kase = built('rover-diff', { goal: 'reach', values: THROUGH_DOOR });
    const wall = kase.world.objects.find((o) => o.id === 'table-1')!;
    const doorZ = FIXTURE_DOOR.center[1] * 1000 - FIXTURE_START_MM[2] + rover.pivot[2];

    expect(caseName('reach', 'room', undefined, room)).toBe('Reach a Spot in Fixture Flat');
    expect(kase.name).toBe('Reach a Spot in Fixture Flat');
    expect(kase.slot!.reachMm).toBeUndefined();
    expect(scaledToReach(kase, 420, [0, 50, 0])).toBe(kase);
    expect(wall.size.map(Math.round)).toEqual([1200, 750, 800]);
    expect(kase.reference.timeline.map((c) => c.target)).toEqual([
      [rover.pivot[0], rover.pivot[1], rover.pivot[2] + 2000],
    ]);
    expect(kase.world.objects.filter((o) => o.name === 'Wall' && Math.abs(o.position[2] - doorZ) < 1)).toHaveLength(3);
  });

  it('builds Push a Box and Follow a Path in the room on wheels and legs', () => {
    for (const id of ['rover-diff', 'hexapod'])
      for (const goal of ['push', 'path'] as const)
        expect(built(id, { goal }).world.objects.length).toBeLessThanOrEqual(256);
  });
});

describe('a room Case in MuJoCo', () => {
  it('a rover reaches a spot through the doorway, and a limp one misses', async () => {
    const mj = await loadMujoco();
    const kase = built('rover-diff', { goal: 'reach', values: THROUGH_DOOR });
    const reference = await runCase(mj, kase, fixture('rover-diff'), { controller: 'reference' });
    const limp = await runCase(mj, kase, fixture('rover-diff'), { controller: 'limp' });

    expect(reference.passed).toBe(true);
    expect(limp.passed).toBe(false);
  });
});
