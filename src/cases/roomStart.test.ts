import { describe, expect, it } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildRig, type V3 } from '../utils/kinematics';
import { builderRobot } from './caseBuilder';
import { FIXTURE_TABLE, FIXTURE_TAP, FIXTURE_TAP_MM, fixtureRoom, fixtureTap } from './roomFixture';
import { readRoomPlan } from './roomPlan';
import { placedRoom } from './roomWorld';
import type { WorldObject } from './schema';

const SCANNED = import.meta.glob<string>('../../e2e/fixtures/scanned-room.json', {
  eager: true,
  query: '?raw',
  import: 'default',
});

const roverDiff = () => fixtureRobots().find((f) => f.id === 'rover-diff')!;

const rover = () => {
  const r = roverDiff();

  return builderRobot(buildRig(r.joints, r.parts), r.parts);
};

const quarterLeft = ([x, y, z]: V3): V3 => [z, y, -x];

const sidewaysRover = () => {
  const r = roverDiff();
  const parts = r.parts.map((p) => ({
    ...p,
    position: quarterLeft(p.position),
    dimensions: { ...p.dimensions, width: p.dimensions.depth, depth: p.dimensions.width },
  }));
  const joints = r.joints.map((j) => ({ ...j, origin: quarterLeft(j.origin), axis: quarterLeft(j.axis) }));

  return builderRobot(buildRig(joints, parts), parts);
};

const read = (basecase?: unknown, turnDeg = 0) =>
  readRoomPlan(JSON.stringify(fixtureRoom({ basecase, turnDeg })), 'Fixture Flat.json');

const tableIn = (objects: WorldObject[]) => objects.find((o) => o.id === 'table-1')!;

const tableFromRobot = (basecase?: unknown, turnDeg = 0, robot = rover()) => {
  const table = tableIn(placedRoom(read(basecase, turnDeg), robot));

  return { at: [0, 2].map((i) => table.position[i] - robot.pivot[i]), size: table.size.map(Math.round) };
};

const untapped = tableFromRobot();

describe('a room file with a tapped start', () => {
  it('reads the start in mm on the floor, and the heading', () => {
    const { start } = read(FIXTURE_TAP);

    start!.at.forEach((v, i) => expect(v).toBeCloseTo(FIXTURE_TAP_MM[i], 3));
    expect(start!.heading).toBeCloseTo(FIXTURE_TAP.heading, 6);
  });

  it('starts the robot on the tapped spot, turned to face the tapped heading', () => {
    const [x, , z] = FIXTURE_TABLE.center.map((m) => m * 1000) as V3;
    const away = [x - FIXTURE_TAP_MM[0], z - FIXTURE_TAP_MM[2]];
    const { at, size } = tableFromRobot(FIXTURE_TAP);

    expect(at[0]).toBeCloseTo(-away[1], 3);
    expect(at[1]).toBeCloseTo(away[0], 3);
    expect(size).toEqual([800, 750, 1200]);
  });

  it('faces the heading with a rover that drives along x', () => {
    const robot = sidewaysRover();
    const ahead = tableFromRobot(FIXTURE_TAP);
    const sideways = tableFromRobot(FIXTURE_TAP, 0, robot);

    robot.forward.forEach((v, i) => expect(v).toBeCloseTo([1, 0, 0][i], 6));
    expect(sideways.at[0]).toBeCloseTo(ahead.at[1], 3);
    expect(sideways.at[1]).toBeCloseTo(-ahead.at[0], 3);
    expect(sideways.size).toEqual([ahead.size[2], ahead.size[1], ahead.size[0]]);
  });

  it('places a room scanned at an angle the same way', () => {
    const square = tableFromRobot(FIXTURE_TAP);
    const turned = tableFromRobot(fixtureTap(25), 25);

    turned.at.forEach((v, i) => expect(v).toBeCloseTo(square.at[i], 3));
    expect(turned.size).toEqual(square.size);
  });

  it('turns the heading to the nearest quarter, square to the walls', () => {
    expect(tableFromRobot({ ...FIXTURE_TAP, heading: FIXTURE_TAP.heading + 0.6 })).toEqual(tableFromRobot(FIXTURE_TAP));
  });

  it('ignores fields it doesn’t know', () => {
    expect(tableFromRobot({ ...FIXTURE_TAP, robot: 'rover', start3d: [1, 2, 3] })).toEqual(tableFromRobot(FIXTURE_TAP));
  });

  it('reads the scan app’s own file', () => {
    const room = readRoomPlan(SCANNED['../../e2e/fixtures/scanned-room.json'], 'Scanned Room.json');

    room.start!.at.forEach((v, i) => expect(v).toBeCloseTo(FIXTURE_TAP_MM[i], 0));
    expect(room.start!.heading).toBeCloseTo(FIXTURE_TAP.heading, 3);
    expect(tableIn(room.objects).size.map(Math.round)).toEqual(FIXTURE_TABLE.dimensions.map((d) => d * 1000));
  });
});

const at = (start: unknown) => ({ ...FIXTURE_TAP, start });

const withStart = (start: string) =>
  JSON.stringify(fixtureRoom({ basecase: { heading: 0 } })).replace('"heading":0', `"heading":0,"start":${start}`);

describe('falling back to the open floor nearest the middle', () => {
  it.each([
    ['inside a wall', at([1.5, -1.2, 2])],
    ['inside the table', at([-1.2, -1.2, -0.6])],
    ['outside the room', at([10, -1.2, 10])],
    ['a kilometre away', at([1000, -1.2, 1000])],
    ['NaN, as JSON writes it', at([Number.NaN, -1.2, -1.2])],
    ['two numbers', at([-0.3, -1.2])],
    ['numbers in words', at(['-0.3', '-1.2', '-1.2'])],
    ['no start', { heading: 1 }],
    ['a heading in words', { ...FIXTURE_TAP, heading: 'east' }],
    ['a list for basecase', [FIXTURE_TAP]],
    ['text for basecase', 'start'],
  ])('a start %s', (_, basecase) => {
    expect(tableFromRobot(basecase)).toEqual(untapped);
  });

  it.each([
    ['infinite', '[1e999,-1.2,-1.2]'],
    ['a million items long', `[${Array(1_000_000).fill(0).join(',')}]`],
  ])('an %s start, and still reads the room', (_, start) => {
    const room = readRoomPlan(withStart(start), 'Fixture Flat.json');

    expect(room.start).toBeUndefined();
    expect(room.objects.length).toBeGreaterThan(0);
  });
});
