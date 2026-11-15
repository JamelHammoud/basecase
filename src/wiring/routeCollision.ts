import * as THREE from 'three';
import type { PortVec } from '../types/ports';

export interface RouteObstacle {
  id: string;
  min: PortVec;
  max: PortVec;
  transform?: THREE.Matrix4;
  inverse?: THREE.Matrix4;
}

export interface RoutePoint {
  position: PortVec;
  obstacleId?: string;
}

export type RelativeBound = (point: RoutePoint, obstacleId: string | undefined) => number;

export const CLEARANCE_MM = 3;
export const EPSILON = 1e-9;
export const AXES = [0, 1, 2] as const;
export const finite = (point: PortVec) => point.length === 3 && point.every(Number.isFinite);
export const distance = (a: PortVec, b: PortVec) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const transformed = (point: PortVec, matrix?: THREE.Matrix4): PortVec =>
  matrix ? (new THREE.Vector3(...point).applyMatrix4(matrix).toArray() as PortVec) : [...point];

export function expanded(obstacle: RouteObstacle): RouteObstacle {
  return {
    ...obstacle,
    min: obstacle.min.map((v) => v - CLEARANCE_MM) as PortVec,
    max: obstacle.max.map((v) => v + CLEARANCE_MM) as PortVec,
  };
}

export function validBox(box: RouteObstacle): boolean {
  return finite(box.min) && finite(box.max) && AXES.every((axis) => box.min[axis] <= box.max[axis]);
}

export function corners(box: RouteObstacle): PortVec[] {
  return Array.from({ length: 8 }, (_, bits) =>
    transformed(
      [bits & 1 ? box.max[0] : box.min[0], bits & 2 ? box.max[1] : box.min[1], bits & 4 ? box.max[2] : box.min[2]],
      box.transform,
    ),
  );
}

function overlapInterval(interval: [number, number], value: number, slope: number): void {
  if (Math.abs(slope) < EPSILON) {
    interval[0] = Math.max(interval[0], value > EPSILON ? 0 : 1);
    interval[1] = Math.min(interval[1], value > EPSILON ? 1 : 0);

    return;
  }

  const crossing = (EPSILON - value) / slope;

  interval[0] = Math.max(interval[0], slope > 0 ? crossing : 0);
  interval[1] = Math.min(interval[1], slope > 0 ? 1 : crossing);
}

export function crossesBox(start: RoutePoint, end: RoutePoint, box: RouteObstacle, bound: RelativeBound): boolean {
  const a = transformed(start.position, box.inverse);
  const b = transformed(end.position, box.inverse);
  const r0 = bound(start, box.id);
  const r1 = bound(end, box.id);
  const interval: [number, number] = [0, 1];

  for (const axis of AXES) {
    const direction = b[axis] - a[axis];

    overlapInterval(interval, a[axis] + r0 - box.min[axis], direction + r1 - r0);
    overlapInterval(interval, box.max[axis] - a[axis] + r0, -direction + r1 - r0);

    if (interval[1] <= interval[0]) return false;
  }

  return interval[1] > interval[0];
}

export const clearSegment = (start: RoutePoint, end: RoutePoint, boxes: RouteObstacle[], bound: RelativeBound) =>
  boxes.every((box) => !crossesBox(start, end, box, bound));
