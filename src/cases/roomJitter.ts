import type { Random } from '../skills/arenaWorld';
import type { BuilderRobot } from './caseGoals';
import type { WorldObject } from './schema';

export interface Footprint {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const MAX_DRAWS = 8;
const OVERLAP_SLACK_MM2 = 1;
const DEG = Math.PI / 180;

export function footprint(o: Pick<WorldObject, 'position' | 'rotation' | 'size'>): Footprint {
  const turn = o.rotation[1] * DEG;
  const cos = Math.abs(Math.cos(turn));
  const sin = Math.abs(Math.sin(turn));
  const halfX = (cos * o.size[0] + sin * o.size[2]) / 2;
  const halfZ = (sin * o.size[0] + cos * o.size[2]) / 2;

  return {
    minX: o.position[0] - halfX,
    maxX: o.position[0] + halfX,
    minZ: o.position[2] - halfZ,
    maxZ: o.position[2] + halfZ,
  };
}

export function overlap(a: Footprint, b: Footprint): number {
  const x = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const z = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);

  return x > 0 && z > 0 ? x * z : 0;
}

export const gapBetween = (a: Footprint, b: Footprint) =>
  Math.max(a.minX - b.maxX, b.minX - a.maxX, a.minZ - b.maxZ, b.minZ - a.maxZ);

export function startBox({ pivot, footprint: { width, depth } }: BuilderRobot): Footprint {
  const half = Math.max(width, depth) / 2;

  return { minX: pivot[0] - half, maxX: pivot[0] + half, minZ: pivot[2] - half, maxZ: pivot[2] + half };
}

const halfDiagonal = (o: WorldObject) => Math.hypot(o.size[0], o.size[2]) / 2;

function withoutJitter(o: WorldObject): WorldObject {
  const fixed = { ...o };

  delete fixed.jitter;

  return fixed;
}

function clampedToStart(o: WorldObject, start: Footprint): WorldObject {
  if (!o.jitter) return o;

  const gap = gapBetween(footprint(o), start);
  const sweep = o.jitter.mm + halfDiagonal(o) * o.jitter.deg * DEG;

  if (sweep < gap) return o;

  const share = Math.max(gap, 0) / sweep;
  const mm = Math.floor(o.jitter.mm * share);
  const deg = Math.floor(o.jitter.deg * share * 10) / 10;

  return mm > 0 || deg > 0 ? { ...o, jitter: { mm, deg } } : withoutJitter(o);
}

export const clearOfStart = (objects: WorldObject[], start: Footprint): WorldObject[] =>
  objects.map((o) => clampedToStart(o, start));

const spread = (random: Random, limit: number) => (2 * random() - 1) * limit;

function drawn(o: WorldObject, random: Random): WorldObject {
  const { mm, deg } = o.jitter!;
  const [x, y, z] = o.position;
  const [rx, ry, rz] = o.rotation;

  return {
    ...o,
    position: [x + spread(random, mm), y, z + spread(random, mm)],
    rotation: [rx, ry + spread(random, deg), rz],
  };
}

export function jitteredFurniture(o: WorldObject, fixed: Footprint[], random: Random): WorldObject {
  const before = fixed.map((f) => overlap(footprint(o), f));

  for (let draw = 0; draw < MAX_DRAWS; draw++) {
    const moved = drawn(o, random);
    const at = footprint(moved);

    if (fixed.every((f, i) => overlap(at, f) <= before[i] + OVERLAP_SLACK_MM2)) return moved;
  }

  return o;
}
