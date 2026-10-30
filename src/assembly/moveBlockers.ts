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

function rayHits(target: Placed, from: THREE.Vector3, dir: THREE.Vector3, travel: number): boolean {
  ray.origin.copy(from).addScaledVector(dir, START_MM).applyMatrix4(target.inverse);
  ray.direction.copy(dirLocal.copy(dir).transformDirection(target.inverse));

  const hit = target.solid.bvh.raycastFirst(ray, THREE.DoubleSide);

  return !!hit && hit.distance <= travel && !insideSolid(target, from.clone().addScaledVector(dir, 0.3));
}

const samplesOf = (p: Placed) => worldPoints(gridSamples(p.solid, GRID_CELLS), p.matrix);

function sweptBox(p: Placed, dir: THREE.Vector3, travel: number) {
  return p.box.clone().union(p.box.clone().translate(dir.clone().multiplyScalar(travel)));
}

function blocks(query: MoveQuery, q: Placed, mine: THREE.Vector3[], swept: THREE.Box3): boolean {
  const { part, dir, travel } = query;

  if (mine.some((o) => q.box.distanceToPoint(o) <= travel && rayHits(q, o, dir, travel))) return true;

  const back = dir.clone().negate();

  return samplesOf(q).some((o) => swept.containsPoint(o) && rayHits(part, o, back, travel));
}

export function blockersAlong(query: MoveQuery): string[] {
  const swept = sweptBox(query.part, query.dir, query.travel);
  const mine = samplesOf(query.part);

  return query.candidates
    .filter((q) => q.id !== query.part.id && q.box.intersectsBox(swept))
    .filter((q) => blocks(query, q, mine, swept))
    .map((q) => q.id);
}

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
