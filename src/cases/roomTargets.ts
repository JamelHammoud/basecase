import type { V3 } from '../utils/kinematics';
import { routeClearance, type BuilderRobot, type GoalSpot } from './caseGoals';
import type { Room } from './roomPlan';
import { footprint, type Footprint } from './roomJitter';
import { placedIn } from './roomWorld';
import type { WorldObject } from './schema';

export interface RoomTarget extends GoalSpot {
  name: string;
}

const SEARCH_MM = 1500;
const STEP_MM = 50;

interface Named {
  object: WorldObject;
  name: string;
}

function numbered(objects: WorldObject[]): Named[] {
  const counts = new Map<string, number>();

  return objects.map((object) => {
    const n = (counts.get(object.name) ?? 0) + 1;

    counts.set(object.name, n);

    return { object, name: n > 1 ? `${object.name} ${n}` : object.name };
  });
}

const grown = (f: Footprint, by: number): Footprint => ({
  minX: f.minX - by,
  maxX: f.maxX + by,
  minZ: f.minZ - by,
  maxZ: f.maxZ + by,
});

const inside = (p: V3, f: Footprint) => p[0] > f.minX && p[0] < f.maxX && p[2] > f.minZ && p[2] < f.maxZ;

const distanceTo = (p: V3, f: Footprint) =>
  Math.hypot(Math.max(f.minX - p[0], 0, p[0] - f.maxX), Math.max(f.minZ - p[2], 0, p[2] - f.maxZ));

const flat = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[2] - b[2]);

const below = (o: WorldObject, headroomMm: number) => o.position[1] - o.size[1] / 2 < headroomMm;

interface Floor {
  bounds: Footprint;
  solid: WorldObject[];
  robot: BuilderRobot;
}

function scoreOf(p: V3, target: WorldObject, robot: BuilderRobot): number[] {
  return [
    Math.floor(distanceTo(p, footprint(target)) / STEP_MM),
    Math.round(flat(p, target.position)),
    flat(p, robot.pivot),
  ];
}

const better = (a: number[], b: number[]) => {
  const i = a.findIndex((x, k) => x !== b[k]);

  return i >= 0 && a[i] < b[i];
};

function frontOf(target: WorldObject, { bounds, solid, robot }: Floor): V3 | undefined {
  const clearance = routeClearance(robot);
  const area = grown(footprint(target), SEARCH_MM);
  const blocked = [...solid, ...(target.behavior === 'marker' ? [] : [target])]
    .map((o) => grown(footprint(o), clearance))
    .filter((f) => f.maxX > area.minX && f.minX < area.maxX && f.maxZ > area.minZ && f.minZ < area.maxZ);
  const steps = Math.ceil((Math.max(area.maxX - area.minX, area.maxZ - area.minZ) / STEP_MM + 1) / 2);
  let best: { at: V3; score: number[] } | undefined;

  for (let i = -steps; i <= steps; i++)
    for (let k = -steps; k <= steps; k++) {
      const at: V3 = [target.position[0] + i * STEP_MM, 0, target.position[2] + k * STEP_MM];
      const open = inside(at, bounds) && !blocked.some((f) => inside(at, f));
      const score = open ? scoreOf(at, target, robot) : null;

      if (score && (!best || better(score, best.score))) best = { at, score };
    }

  return best?.at;
}

function underOf(target: WorldObject, { solid, robot }: Floor): V3 | undefined {
  const at: V3 = [target.position[0], 0, target.position[2]];
  const clearance = routeClearance(robot);

  if (!robot.heightMm || below(target, robot.heightMm)) return undefined;

  return solid.some((o) => inside(at, grown(footprint(o), clearance))) ? undefined : at;
}

function wallBounds(objects: WorldObject[]): Footprint {
  const walls = objects.filter((o) => o.name === 'Wall').map(footprint);

  return walls.reduce(
    (b, f) => ({
      minX: Math.min(b.minX, f.minX),
      maxX: Math.max(b.maxX, f.maxX),
      minZ: Math.min(b.minZ, f.minZ),
      maxZ: Math.max(b.maxZ, f.maxZ),
    }),
    { minX: -Infinity, maxX: Infinity, minZ: -Infinity, maxZ: Infinity },
  );
}

function targetsOf({ object, name }: Named, floor: Floor): RoomTarget[] {
  const front = frontOf(object, floor);
  const under = object.behavior === 'static' ? underOf(object, floor) : undefined;

  return [
    ...(front ? [{ name, at: front, phrase: `at the ${name}` }] : []),
    ...(under ? [{ name: `Under ${name}`, at: under, phrase: `under the ${name}` }] : []),
  ];
}

const found = new WeakMap<Room, Map<string, RoomTarget[]>>();

const standing = ({ pivot, forward, footprint, heightMm }: BuilderRobot) =>
  [...pivot, ...forward, footprint.width, footprint.depth, heightMm].join();

export function roomTargets(room: Room, robot: BuilderRobot): RoomTarget[] {
  const byRobot = found.get(room) ?? new Map<string, RoomTarget[]>();
  const key = standing(robot);
  const known = byRobot.get(key);

  if (known) return known;

  const targets = searchedTargets(room, robot);

  found.set(room, byRobot.set(key, targets));

  return targets;
}

function searchedTargets(room: Room, robot: BuilderRobot): RoomTarget[] {
  const objects = placedIn(room, robot, room.objects);
  const doors = placedIn(room, robot, room.doors);
  const headroom = robot.heightMm || Infinity;
  const floor: Floor = {
    bounds: wallBounds(objects),
    solid: objects.filter((o) => o.behavior !== 'marker' && below(o, headroom)),
    robot,
  };
  const furniture = objects.filter((o) => o.behavior === 'static' && o.name !== 'Wall');

  return [...numbered(doors), ...numbered(furniture)].flatMap((named) => targetsOf(named, floor));
}

const wordsOf = (text: string) =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w && w !== 'the');

const UNDER = 'under';

export function targetNamed(targets: RoomTarget[], asked: string): RoomTarget | undefined {
  const words = new Set(wordsOf(asked));
  const named = targets.map((target) => ({ target, words: wordsOf(target.name) }));
  const known = new Set([UNDER, ...named.flatMap((t) => t.words)]);
  const needed = [...words].filter((w) => known.has(w) || /^\d+$/.test(w));

  return named.find((t) => t.words.length === needed.length && needed.every((w) => t.words.includes(w)))?.target;
}
