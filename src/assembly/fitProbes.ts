import * as THREE from 'three';
import type { Placed } from '../three/analysis/collide';
import type { ChainResult } from './assemblyTypes';

export interface InsertWall {
  host: string;
  minMm: number;
}

export interface FitProbes {
  insertWalls: Record<string, InsertWall>;
  leadRoomMm: Record<string, number>;
}

const SPOKES = 8;
const LEVELS = [-0.3, 0, 0.3];
const REACH_MM = 25;
const NO_WALL_GAP_MM = 2;
const LEAD_REACH_MM = 200;
const SAME_HIT_MM = 0.02;
const ray = new THREE.Ray();

function sortedHits(target: Placed, origin: THREE.Vector3, dir: THREE.Vector3): number[] {
  ray.origin.copy(origin).applyMatrix4(target.inverse);
  ray.direction.copy(dir).transformDirection(target.inverse);

  return target.solid.bvh
    .raycast(ray, THREE.DoubleSide)
    .map((h) => h.distance)
    .sort((a, b) => a - b)
    .filter((d, i, all) => i === 0 || d - all[i - 1] > SAME_HIT_MM);
}

function spokesAround(axis: THREE.Vector3): THREE.Vector3[] {
  const side = new THREE.Vector3(Math.abs(axis.x) < 0.9 ? 1 : 0, Math.abs(axis.x) < 0.9 ? 0 : 1, 0)
    .cross(axis)
    .normalize();
  const other = axis.clone().cross(side);

  return Array.from({ length: SPOKES }, (_, i) => {
    const a = (i / SPOKES) * Math.PI * 2;

    return side.clone().multiplyScalar(Math.cos(a)).addScaledVector(other, Math.sin(a));
  });
}

function wallAlong(host: Placed, from: THREE.Vector3, dir: THREE.Vector3): number | null {
  const hits = sortedHits(host, from, dir).filter((d) => d <= REACH_MM);

  if (hits.length < 2 || hits[0] > NO_WALL_GAP_MM + REACH_MM / 4) return null;

  return hits[1] - hits[0];
}

function insertWall(insert: Placed, host: Placed): number | null {
  const centre = insert.box.getCenter(new THREE.Vector3());
  const axis = new THREE.Vector3().setFromMatrixColumn(insert.matrix, 1).normalize();
  const half = Math.abs(insert.box.getSize(new THREE.Vector3()).dot(axis)) / 2;
  const spokes = spokesAround(axis);
  const walls = LEVELS.flatMap((level) => {
    const from = centre.clone().addScaledVector(axis, level * half * 2);

    return spokes.map((d) => wallAlong(host, from, d)).filter((w): w is number => w !== null);
  });

  return walls.length ? Math.min(...walls) : null;
}

function insertWalls(placed: Map<string, Placed>, chains: ChainResult): Record<string, InsertWall> {
  const out: Record<string, InsertWall> = {};

  for (const s of chains.sleeves) {
    const insert = placed.get(s.id);
    const host = s.host ? placed.get(s.host) : undefined;

    if (s.kind !== 'insert' || !insert || !host) continue;

    const minMm = insertWall(insert, host);

    if (minMm !== null) out[s.id] = { host: host.id, minMm };
  }

  return out;
}

function firstSolid(from: THREE.Vector3, dir: THREE.Vector3, others: Placed[]): number {
  let nearest = LEAD_REACH_MM;

  for (const q of others) {
    const hit = sortedHits(q, from, dir)[0];

    if (hit !== undefined && hit < nearest) nearest = hit;
  }

  return nearest;
}

function leadRoom(pack: Placed, placed: Placed[]): number {
  const size = pack.box.getSize(new THREE.Vector3());
  const centre = pack.box.getCenter(new THREE.Vector3());
  const lengths = [size.x, size.y, size.z];
  const k = lengths.indexOf(Math.max(...lengths));
  const others = placed.filter((q) => q.id !== pack.id);
  const room = [1, -1].map((sign) => {
    const dir = new THREE.Vector3().setComponent(k, sign);
    const from = centre.clone().addScaledVector(dir, size.getComponent(k) / 2 + 0.05);

    return firstSolid(from, dir, others);
  });

  return Math.max(...room);
}

export function fitProbes(placed: Placed[], chains: ChainResult, batteries: string[]): FitProbes {
  const byId = new Map(placed.map((p) => [p.id, p]));
  const leadRoomMm: Record<string, number> = {};

  for (const id of batteries) {
    const pack = byId.get(id);

    if (pack) leadRoomMm[id] = leadRoom(pack, placed);
  }

  return { insertWalls: insertWalls(byId, chains), leadRoomMm };
}
