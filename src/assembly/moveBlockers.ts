import * as THREE from 'three';
import type { Placed } from '../three/analysis/collide';
import type { V3 } from './assemblyTypes';
import { insideSolid } from './probe';
import { gridSamples, worldPoints } from './samples';

export const AXES: V3[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

const GRID_CELLS = 9;
const START_MM = 0.15;
const ray = new THREE.Ray();
const dirLocal = new THREE.Vector3();

export interface MoveQuery {
  part: Placed;
  dir: THREE.Vector3;
  travel: number;
  candidates: Placed[];
}

const GRAZE_MM = 0.12;
const LIP_DEPTH_MM = 3;
const LIP_SHARE = 0.1;
const LIP_MIN_HITS = 2;

function hitDistance(target: Placed, from: THREE.Vector3, dir: THREE.Vector3, travel: number): number | null {
  if (insideSolid(target, from.clone().addScaledVector(dir, 0.3))) return null;

  ray.origin.copy(from).addScaledVector(dir, START_MM).applyMatrix4(target.inverse);
  ray.direction.copy(dirLocal.copy(dir).transformDirection(target.inverse));

  const hit = target.solid.bvh.raycastFirst(ray, THREE.DoubleSide);

  return hit && hit.distance <= travel ? hit.distance : null;
}

function grazeOffsets(dir: THREE.Vector3): THREE.Vector3[] {
  const side = new THREE.Vector3(Math.abs(dir.x) < 0.9 ? 1 : 0, Math.abs(dir.x) < 0.9 ? 0 : 1, 0)
    .cross(dir)
    .normalize()
    .multiplyScalar(GRAZE_MM);
  const other = dir.clone().cross(side);

  return [side, side.clone().negate(), other, other.clone().negate()];
}

function solidHit(target: Placed, from: THREE.Vector3, dir: THREE.Vector3, travel: number): number | null {
  const hit = hitDistance(target, from, dir, travel);

  if (hit === null) return null;

  const held = grazeOffsets(dir).every((o) => hitDistance(target, from.clone().add(o), dir, travel) !== null);

  return held ? hit : null;
}

const samplesOf = (p: Placed) => worldPoints(gridSamples(p.solid, GRID_CELLS), p.matrix);

function sweptBox(p: Placed, dir: THREE.Vector3, travel: number) {
  return p.box.clone().union(p.box.clone().translate(dir.clone().multiplyScalar(travel)));
}

export type Block = 'none' | 'lip' | 'solid';

function shootAll(from: THREE.Vector3[], shoot: (o: THREE.Vector3) => number | null): Block {
  const limit = Math.max(LIP_MIN_HITS, from.length * LIP_SHARE);
  let hits = 0;

  for (const o of from) {
    const d = shoot(o);

    if (d === null) continue;

    hits++;

    if (d > LIP_DEPTH_MM || hits > limit) return 'solid';
  }

  return hits ? 'lip' : 'none';
}

function blockOf(query: MoveQuery, q: Placed, mine: THREE.Vector3[], swept: THREE.Box3): Block {
  const { part, dir, travel } = query;
  const forward = shootAll(mine, (o) => (q.box.distanceToPoint(o) <= travel ? solidHit(q, o, dir, travel) : null));

  if (forward === 'solid') return 'solid';

  const back = dir.clone().negate();
  const theirs = samplesOf(q);
  const backward = shootAll(theirs, (o) => (swept.containsPoint(o) ? solidHit(part, o, back, travel) : null));

  if (backward === 'solid') return 'solid';

  return forward === 'lip' || backward === 'lip' ? 'lip' : 'none';
}

export function blocksAlong(query: MoveQuery): { solid: string[]; lips: string[] } {
  const swept = sweptBox(query.part, query.dir, query.travel);
  const mine = samplesOf(query.part);
  const out = { solid: [] as string[], lips: [] as string[] };

  for (const q of query.candidates) {
    if (q.id === query.part.id || !q.box.intersectsBox(swept)) continue;

    const block = blockOf(query, q, mine, swept);

    if (block === 'solid') out.solid.push(q.id);

    if (block === 'lip') out.lips.push(q.id);
  }

  return out;
}

export const blockersAlong = (query: MoveQuery): string[] => {
  const { solid, lips } = blocksAlong(query);

  return [...solid, ...lips];
};

export function ownTravel(p: Placed, dir: THREE.Vector3): number {
  const size = p.box.getSize(new THREE.Vector3());

  return Math.abs(size.x * dir.x) + Math.abs(size.y * dir.y) + Math.abs(size.z * dir.z) + 5;
}

export function exitTravel(p: Placed, dir: THREE.Vector3, robot: THREE.Box3): number {
  const centre = p.box.getCenter(new THREE.Vector3());
  const far = new THREE.Ray(centre, dir).intersectBox(robot.clone().expandByScalar(1), new THREE.Vector3());

  return ownTravel(p, dir) + (far ? far.distanceTo(centre) : 0);
}

export function directionsFor(axes: V3[]): THREE.Vector3[] {
  const out = AXES.map((a) => new THREE.Vector3(...a));

  for (const a of axes) {
    const v = new THREE.Vector3(...a).normalize();

    for (const d of [v, v.clone().negate()]) if (!out.some((o) => o.dot(d) > 0.985)) out.push(d);
  }

  return out.slice(0, 10);
}
