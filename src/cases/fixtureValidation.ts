import { safeId } from '../sim/mjcfText';
import type { WorldItem } from '../sim/mjcfTypes';
import type { PassiveJoint } from '../sim/passiveJoint';
import type { V3 } from '../utils/kinematics';
import type { WorldObject } from './schema';
import { asBoolean, asId, asNumber, asRecord, oneOf, optional, refuse, vector, type Reader } from './validate';

const MAX_EXTENT_MM = 50_000;
const MAX_FIXTURE_JOINTS = 32;
const MAX_DEPTH = 16;

const bounded = (value: number, min: number, max: number, where: string) =>
  value >= min && value <= max ? value : refuse(where, `must be from ${min} to ${max}`);

export const readPassiveJoint: Reader<PassiveJoint> = (value, where) => {
  const v = asRecord(value, where);
  const type = oneOf(['revolute', 'prismatic'] as const)(v.type, `${where}.type`);
  const axis = vector(3)(v.axis, `${where}.axis`) as V3;
  const origin = vector(3)(v.origin, `${where}.origin`) as V3;
  const range = vector(2)(v.range, `${where}.range`) as [number, number];
  const extent = type === 'revolute' ? 179 : 10_000;

  if (Math.abs(Math.hypot(...axis) - 1) > 1e-6) refuse(where, 'needs a unit axis');

  if (origin.some((n) => !Number.isFinite(n) || Math.abs(n) > MAX_EXTENT_MM)) refuse(where, 'exceeds the world bounds');

  if (range[0] > 0 || range[1] < 0 || range[0] >= range[1] || range.some((n) => Math.abs(n) > extent))
    refuse(where, 'needs ordered limits containing zero within the travel bounds');

  return {
    type,
    origin,
    axis,
    range,
    damping: bounded(asNumber(v.damping, where), 0, 1000, `${where}.damping`),
    frictionloss: bounded(asNumber(v.frictionloss, where), 0, 1000, `${where}.frictionloss`),
    ...(v.stiffness === undefined
      ? {}
      : { stiffness: bounded(asNumber(v.stiffness, where), 0, 1e6, `${where}.stiffness`) }),
    ...(v.springref === undefined
      ? {}
      : { springref: bounded(asNumber(v.springref, where), range[0], range[1], `${where}.springref`) }),
    ...(v.locked === undefined ? {} : { locked: optional(asBoolean, v.locked, `${where}.locked`) }),
  };
};

function checkFixtureObject(object: WorldObject) {
  if (object.movable || object.jitter || object.behavior === 'marker')
    refuse(object.id, 'cannot move by script, jitter or act as a marker in a fixture');

  if ((object.parent || object.joint) && object.behavior !== 'dynamic')
    refuse(object.id, 'needs dynamic geometry in a fixture');

  if (
    object.size.some((n) => !Number.isFinite(n) || n <= 0 || n > 10_000) ||
    object.position.some((n) => !Number.isFinite(n) || Math.abs(n) > MAX_EXTENT_MM)
  )
    refuse(object.id, 'exceeds fixture geometry bounds');

  if (object.behavior === 'dynamic' && !(object.massG !== undefined && object.massG >= 0.1 && object.massG <= 1e6))
    refuse(object.id, 'needs a mass from 0.1 to 1000000 grams');

  if (object.friction !== undefined) bounded(object.friction, 0, 100, `${object.id}.friction`);
}

function checkSimulationNames(objects: WorldObject[]) {
  const articulated = objects.some((object) => object.joint || object.parent);

  if (
    articulated &&
    (objects.length > 256 || new Set(objects.map((object) => safeId(object.id))).size !== objects.length)
  )
    refuse('world.objects', 'needs at most 256 objects with distinct simulation names');
}

export function validateFixtures(objects: WorldObject[]) {
  const byId = new Map(objects.map((object) => [object.id, object]));

  checkSimulationNames(objects);

  const parents = new Set(objects.flatMap((object) => (object.parent ? [object.parent] : [])));

  if (objects.filter((object) => object.joint).length > MAX_FIXTURE_JOINTS)
    refuse('world.objects', `holds more than ${MAX_FIXTURE_JOINTS} fixture joints`);

  for (const object of objects) {
    if (object.parent || object.joint || parents.has(object.id)) checkFixtureObject(object);

    const visited = new Set([object.id]);
    let ancestor = object;

    while (ancestor.parent) {
      const parent = byId.get(ancestor.parent);

      if (!parent || visited.has(parent.id) || visited.size >= MAX_DEPTH)
        return refuse(object.id, 'needs an acyclic fixture tree no deeper than 16 objects');

      visited.add(parent.id);
      ancestor = parent;
    }

    if (object.parent && ancestor.behavior !== 'static' && !ancestor.joint)
      refuse(object.id, 'needs a fixed or jointed fixture root');
  }
}

export function validateWorldFixtures(items: WorldItem[]) {
  const objects = items.map((item): WorldObject => ({
    id: item.id,
    name: item.name,
    kind: 'box',
    size: [item.dimensions.width, item.dimensions.height, item.dimensions.depth],
    position: item.position,
    rotation: item.rotation,
    color: item.color,
    behavior: item.behavior,
    massG: item.massG,
    friction: item.physics?.friction,
    movable: item.movable,
    parent: item.parent === undefined ? undefined : asId(item.parent, `${item.id}.parent`),
    joint: item.joint ? readPassiveJoint(item.joint, item.id) : undefined,
  }));

  if (new Set(objects.map((object) => object.id)).size !== objects.length) refuse('world', 'repeats an id');

  validateFixtures(objects);
}
