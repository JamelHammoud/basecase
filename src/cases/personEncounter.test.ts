import { describe, expect, it } from 'vitest';
import { personAt, preparePerson, readPersonEncounter, validatePeople, type PersonEncounter } from './personEncounter';
import { readWorldObjects, worldItem, type WorldObject } from './schema';
import { scaledToReach } from './scale';
import { fixtureRobots } from '../sim/fixtures/robots';
import { touchTheDots } from './testing';

const route: PersonEncounter = {
  speedMmS: 500,
  startSeconds: 1,
  route: [
    { position: [-500, 850, 0], pauseSeconds: 0.5 },
    { position: [500, 850, 0], pauseSeconds: 1 },
    { position: [500, 850, 500], pauseSeconds: 0 },
  ],
};

const crossingPerson = (changes: Partial<WorldObject> = {}): WorldObject => ({
  id: 'person',
  name: 'Person',
  kind: 'box',
  size: [500, 1700, 300],
  position: [-500, 850, 0],
  rotation: [0, 0, 0],
  behavior: 'static',
  movable: true,
  color: '#888888',
  person: structuredClone(route),
  ...changes,
});

describe('authored person encounters', () => {
  it('holds delayed starts, waypoint pauses and the final pose in world coordinates', () => {
    const person = preparePerson(readPersonEncounter(route, 'person'));

    expect(personAt(person, 0)).toEqual([-500, 850, 0]);
    expect(personAt(person, 1.5)).toEqual([-500, 850, 0]);
    expect(personAt(person, 2.5)).toEqual([0, 850, 0]);
    expect(personAt(person, 3.5)).toEqual([500, 850, 0]);
    expect(personAt(person, 4.5)).toEqual([500, 850, 0]);
    expect(personAt(person, 5)).toEqual([500, 850, 250]);
    expect(personAt(person, 600)).toEqual([500, 850, 500]);
  });

  it.each([
    { speedMmS: NaN },
    { speedMmS: 0 },
    { startSeconds: -1 },
    { startSeconds: 600 },
    { route: [] },
    { route: route.route.slice(0, 1) },
    { route: Array.from({ length: 33 }, () => route.route[0]) },
    { route: [route.route[0], route.route[0]] },
    { route: [{ ...route.route[0], pauseSeconds: 11 }, route.route[1]] },
    { route: [{ position: [Infinity, 850, 0], pauseSeconds: 0 }, route.route[1]] },
    { route: [route.route[0], { position: [0, 851, 0], pauseSeconds: 0 }] },
    { route: [route.route[0], { position: [30_000, 850, 0], pauseSeconds: 0 }] },
  ])('refuses malformed or unbounded declarations %#', (changes) => {
    expect(() => readPersonEncounter({ ...route, ...changes }, 'person')).toThrow();
  });

  it('retains declarations through ordinary parsing and emits matching generated geometry', () => {
    const [person] = readWorldObjects([crossingPerson()]);
    const item = worldItem(person);

    expect(person.person).toEqual(route);
    expect(item.person).toEqual(route);
    expect(item.kind).toBe('mesh');
    expect(item.mesh!.positions.length).toBeGreaterThan(100);
    expect(item.mesh!.baseSize).toEqual(person.size);
    expect(readWorldObjects(JSON.parse(JSON.stringify([person])))).toEqual([person]);
  });

  it('refuses actor count, conflicting ownership, geometry and dimension changes', () => {
    expect(() => readWorldObjects(Array.from({ length: 17 }, (_, i) => crossingPerson({ id: `p${i}` })))).toThrow();

    for (const changes of [
      { size: [0, 1700, 300] },
      { size: [500, 2500, 300] },
      { movable: false },
      { behavior: 'dynamic' },
      { position: [0, 850, 0] },
      { rotation: [0, 1, 0] },
      { parent: 'wall' },
      { jitter: { mm: 1, deg: 0 } },
    ] as Partial<WorldObject>[]) {
      expect(() => readWorldObjects([crossingPerson(changes)])).toThrow();
    }
  });

  it('refuses routes through static geometry before simulation, including a rotated wall', () => {
    const person = crossingPerson();
    const wall = {
      ...person,
      id: 'wall',
      person: undefined,
      movable: false,
      position: [0, 850, 0],
      size: [20, 1700, 500],
    } as WorldObject;

    expect(() => validatePeople([person, wall].map(worldItem))).toThrow(/wall/);

    const rotated: WorldObject = { ...wall, rotation: [0, 45, 0] };
    const away: WorldObject = { ...wall, position: [0, 850, 2000] };

    expect(() => validatePeople([person, rotated].map(worldItem))).toThrow(/wall/);
    expect(() => validatePeople([person, away].map(worldItem))).not.toThrow();
  });

  it('keeps authored people and routes at their real scale when robot reach changes', () => {
    const source = touchTheDots(fixtureRobots().find((robot) => robot.id === 'arm-3dof')!);

    source.world.objects.push(crossingPerson());
    expect(scaledToReach(source, 2500, [100, 0, 300])).toEqual(source);
  });
});
