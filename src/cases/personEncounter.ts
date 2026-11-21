import { Box3, Vector3 } from 'three';
import type { WorldItem } from '../sim/mjcfTypes';
import { safeId } from '../sim/mjcfText';
import { partMatrix, type V3 } from '../utils/kinematics';
import type { WorldObject } from './schema';
import { asNumber, asRecord, listOf, refuse, vector, type Reader } from './validate';

export const MAX_PEOPLE = 16;
export const MAX_PERSON_WAYPOINTS = 32;
export const MAX_PERSON_SECONDS = 600;

export interface PersonWaypoint {
  position: V3;
  pauseSeconds: number;
}

export interface PersonEncounter {
  route: PersonWaypoint[];
  speedMmS: number;
  startSeconds: number;
}

export interface PreparedPerson {
  encounter: PersonEncounter;
  arrivals: number[];
  departures: number[];
}

const bounded = (value: unknown, min: number, max: number, where: string) => {
  const n = asNumber(value, where);

  return n >= min && n <= max ? n : refuse(where, `must be from ${min} to ${max}`);
};

const readWaypoint: Reader<PersonWaypoint> = (value, where) => {
  const v = asRecord(value, where);
  const position = vector(3)(v.position, `${where}.position`) as V3;

  if (position.some((n) => Math.abs(n) > 50_000)) refuse(where, 'exceeds the world bounds');

  return { position, pauseSeconds: bounded(v.pauseSeconds, 0, 10, `${where}.pauseSeconds`) };
};

export function preparePerson(encounter: PersonEncounter): PreparedPerson {
  const arrivals = [encounter.startSeconds];
  const departures = [encounter.startSeconds + encounter.route[0].pauseSeconds];

  for (let i = 1; i < encounter.route.length; i++) {
    const previous = encounter.route[i - 1].position;
    const point = encounter.route[i];
    const distance = Math.hypot(...point.position.map((n, axis) => n - previous[axis]));
    const arrival = departures[i - 1] + distance / encounter.speedMmS;

    arrivals.push(arrival);
    departures.push(arrival + point.pauseSeconds);
  }

  return { encounter, arrivals, departures };
}

export const readPersonEncounter: Reader<PersonEncounter> = (value, where) => {
  const v = asRecord(value, where);
  const encounter: PersonEncounter = {
    route: listOf(readWaypoint, MAX_PERSON_WAYPOINTS)(v.route, `${where}.route`),
    speedMmS: bounded(v.speedMmS, 50, 3000, `${where}.speedMmS`),
    startSeconds: bounded(v.startSeconds, 0, MAX_PERSON_SECONDS, `${where}.startSeconds`),
  };
  const route = encounter.route;

  if (route.length < 2) refuse(where, 'needs at least two waypoints');

  let length = 0;

  for (let i = 1; i < route.length; i++) {
    const distance = Math.hypot(...route[i].position.map((n, axis) => n - route[i - 1].position[axis]));

    if (distance < 1 || route[i].position[1] !== route[0].position[1])
      refuse(where, 'needs distinct waypoints on one level');

    length += distance;
  }

  if (length > 20_000 || preparePerson(encounter).departures.at(-1)! > MAX_PERSON_SECONDS)
    refuse(where, 'exceeds 20000 mm of travel or 600 seconds');

  return encounter;
};

export function personAt(person: PreparedPerson, time: number, out: V3 = [0, 0, 0]): V3 {
  const { encounter, arrivals, departures } = person;
  const route = encounter.route;
  let next = 0;

  while (next < arrivals.length && arrivals[next] <= time) next++;

  if (next === arrivals.length) next = -1;

  const from = next < 0 ? route.length - 1 : Math.max(0, next - 1);
  const to = next < 0 ? from : next;
  const fraction = to === from ? 0 : Math.max(0, (time - departures[from]) / (arrivals[to] - departures[from]));

  for (let axis = 0; axis < 3; axis++)
    out[axis] = route[from].position[axis] + (route[to].position[axis] - route[from].position[axis]) * fraction;

  return out;
}

export function validatePersonObject(object: WorldObject) {
  if (!object.person) return;

  const size = object.size;
  const limits = [
    [200, 1000],
    [500, 2400],
    [100, 800],
  ];

  if (size.some((n, i) => !Number.isFinite(n) || n < limits[i][0] || n > limits[i][1]))
    refuse(object.id, 'exceeds person body dimensions');

  if (
    object.kind !== 'box' ||
    object.behavior !== 'static' ||
    !object.movable ||
    object.parent ||
    object.joint ||
    object.geometry ||
    object.jitter ||
    object.rotation.some((n) => n !== 0) ||
    object.position.some((n, i) => n !== object.person!.route[0].position[i]) ||
    object.position[1] < size[1] / 2
  )
    refuse(object.id, 'needs an upright scripted person at its first waypoint');
}

function itemBounds(item: WorldItem): Box3 {
  const bounds = new Box3();

  if (item.convexVertices) {
    for (let i = 0; i < item.convexVertices.length; i += 3)
      bounds.expandByPoint(new Vector3().fromArray(item.convexVertices, i));

    return bounds.translate(new Vector3(...item.position));
  }

  const d = item.dimensions;
  const half = new Vector3(d.width / 2, d.height / 2, d.depth / 2);

  return bounds.set(half.clone().negate(), half).applyMatrix4(partMatrix(item));
}

function crosses(bounds: Box3, from: V3, to: V3): boolean {
  let entry = 0;
  let exit = 1;

  for (let axis = 0; axis < 3; axis++) {
    const min = bounds.min.getComponent(axis);
    const max = bounds.max.getComponent(axis);
    const delta = to[axis] - from[axis];

    if (delta === 0 && (from[axis] <= min || from[axis] >= max)) return false;

    if (delta === 0) continue;

    const a = (min - from[axis]) / delta;
    const b = (max - from[axis]) / delta;

    entry = Math.max(entry, Math.min(a, b));
    exit = Math.min(exit, Math.max(a, b));

    if (entry >= exit) return false;
  }

  return entry < exit;
}

export function validatePeople(items: WorldItem[]) {
  const people = items.filter((item) => item.person);

  if (people.length > MAX_PEOPLE) refuse('world', `holds more than ${MAX_PEOPLE} people`);

  if (!people.length) return;

  if (new Set(items.map((item) => safeId(item.id))).size !== items.length)
    refuse('world', 'needs distinct simulation names');

  const obstacles = items
    .filter((item) => item.behavior === 'static' && !item.person)
    .map((item) => ({
      id: item.id,
      bounds: itemBounds(item),
    }));

  for (const person of people) {
    const encounter = readPersonEncounter(person.person, person.id);
    const d = person.dimensions;
    const half = new Vector3(d.width / 2, d.height / 2, d.depth / 2);

    for (const obstacle of obstacles) {
      const bounds = obstacle.bounds.clone().expandByVector(half);

      if (encounter.route.slice(1).some((point, i) => crosses(bounds, encounter.route[i].position, point.position)))
        refuse(person.id, `route crosses ${obstacle.id}`);
    }
  }
}

export function validateEncounterTime(objects: WorldObject[], seconds: number) {
  for (const object of objects) {
    if (object.person && preparePerson(object.person).departures.at(-1)! >= seconds)
      refuse(object.id, 'needs a route that finishes within the Case time');
  }
}
