import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildRig, type V3 } from '../utils/kinematics';
import { buildCase, builderRobot, type CaseSpec } from './caseBuilder';
import type { BuilderRobot } from './caseGoals';
import { readRoomPlan } from './roomPlan';
import { fixtureRoom } from './roomFixture';
import { footprint, type Footprint } from './roomJitter';
import { roomTargets, targetNamed } from './roomTargets';
import { placedIn } from './roomWorld';
import { caseRunner } from './runCase';
import type { Case } from './schema';
import { caseRobot, runCase } from './testing';

const fixture = (id: string) => fixtureRobots().find((r) => r.id === id)!;

const robotOf = (id: string): BuilderRobot => {
  const r = fixture(id);

  return builderRobot(buildRig(r.joints, r.parts), r.parts);
};

const room = readRoomPlan(JSON.stringify(fixtureRoom()), 'Fixture Flat.json');
const rover = robotOf('rover-diff');
const tall: BuilderRobot = { ...rover, heightMm: 800 };

function built(spec: Omit<CaseSpec, 'room' | 'world'>, robot = rover): Case {
  const result = buildCase({ ...spec, world: 'room', room }, robot);

  if (!result.ok) throw new Error(result.problem);

  return result.kase;
}

const at = (kase: Case, id: string) => kase.world.objects.find((o) => o.id === id)!.position;

const target = (name: string, robot = rover) => roomTargets(room, robot).find((t) => t.name === name)!;

const flatGap = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[2] - b[2]);

const inside = (p: V3, f: Footprint) => p[0] > f.minX && p[0] < f.maxX && p[2] > f.minZ && p[2] < f.maxZ;

function crossesSolid(kase: Case, from: V3, to: V3): boolean {
  const solid = kase.world.objects
    .filter((o) => o.behavior === 'static' && o.position[1] - o.size[1] / 2 < rover.heightMm)
    .map(footprint);

  return Array.from({ length: 101 }, (_, i): V3 => {
    const t = i / 100;

    return [from[0] + (to[0] - from[0]) * t, 0, from[2] + (to[2] - from[2]) * t];
  }).some((p) => solid.some((f) => inside(p, f)));
}

describe('named targets in a room', () => {
  it('offers the doors and static furniture by name, and Under only where the robot fits', () => {
    expect(roomTargets(room, rover).map((t) => t.name)).toEqual(['Door', 'Sofa', 'Table', 'Under Table']);
    expect(roomTargets(room, tall).map((t) => t.name)).toEqual(['Door', 'Sofa', 'Table']);
  });

  it('puts Reach the Door’s spot in the doorway', () => {
    const kase = built({ goal: 'reach', targets: ['Door'] });
    const [door] = placedIn(room, rover, room.doors);

    expect(flatGap(at(kase, 'spot'), door.position)).toBeLessThan(1);
    expect(kase.brief).toBe('Reach the spot at the Door and stop on it.');
  });

  it('puts a furniture spot on the open floor in front of it, and Under in the middle beneath it', () => {
    const table = placedIn(room, rover, room.objects).find((o) => o.name === 'Table')!;
    const front = target('Table').at;
    const under = built({ goal: 'reach', targets: ['Under Table'] });

    expect(inside(front, footprint(table))).toBe(false);
    expect(flatGap(front, table.position)).toBeLessThan(1000);
    expect(flatGap(at(under, 'spot'), table.position)).toBeLessThan(1);
    expect(under.brief).toBe('Reach the spot under the Table and stop on it.');
    expect(under.task.seconds).toBe(Math.ceil(flatGap(rover.pivot, table.position) / 100));
  });

  it('refuses Under the Table on a robot taller than its underside', () => {
    const result = buildCase({ goal: 'reach', world: 'room', room, targets: ['Under Table'] }, tall);

    expect(result).toEqual({ ok: false, problem: 'Pick a target in Fixture Flat: Door, Sofa, Table.' });
  });

  it('routes Follow a Path from the Sofa to the Door to the Table through open floor', () => {
    const kase = built({ goal: 'path', values: { stops: 3 }, targets: ['Sofa', 'Door', 'Table'] });
    const route = [rover.pivot, ...kase.reference.timeline.map((c) => c.target!)];

    ['Sofa', 'Door', 'Table'].forEach((name, i) => expect(flatGap(at(kase, `spot${i}`), target(name).at)).toBe(0));
    route.slice(1).forEach((to, i) => expect(crossesSolid(kase, route[i], to)).toBe(false));
  });

  it('matches the words a person or the agent uses', () => {
    const targets = roomTargets(room, rover);
    const named = (asked: string) => targetNamed(targets, asked)?.name;

    expect(['table', 'the kitchen table', 'under the kitchen table', 'DOOR', 'fridge'].map(named)).toEqual([
      'Table',
      'Table',
      'Under Table',
      'Door',
      undefined,
    ]);
  });
});

describe('Under the Table in MuJoCo', () => {
  it('a rover drives under the table and stops, and a limp one misses', async () => {
    const mj = await loadMujoco();
    const kase = built({ goal: 'reach', targets: ['Under Table'] });
    const reference = await runCase(mj, kase, fixture('rover-diff'), { controller: 'reference' });
    const limp = await runCase(mj, kase, fixture('rover-diff'), { controller: 'limp' });

    expect(reference.passed).toBe(true);
    expect(limp.passed).toBe(false);
  }, 60000);

  it('gives 20 seeded runs, each with its own layout, and a pass count', async () => {
    const mj = await loadMujoco();
    const kase = built({ goal: 'reach', targets: ['Under Table'] });
    const runner = caseRunner(mj, kase, caseRobot(fixture('rover-diff')), { controller: 'reference' });
    const runs = [];

    for (let seed = 1; seed <= 20; seed++) runs.push(await runner.run(seed));

    const layouts = new Set(runs.map((r) => JSON.stringify([at(r.case, 'table-1'), at(r.case, 'sofa-1')])));

    expect(layouts.size).toBe(20);
    expect(runs.filter((r) => r.passed).length).toBeGreaterThanOrEqual(15);
  }, 120000);
});
