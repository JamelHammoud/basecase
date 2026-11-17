import * as THREE from 'three';
import { detectSheet } from '../../sheet/detectSheet';
import { measureTriangles, type MeshMeasure } from '../meshMeasure';
import { checkPrintability, extraPoses, type PrintPose, type PrintShape, type Vec3 } from '../printability';
import type { ShapeSolid } from './shapeSolid';
import { convexHull } from '../../utils/engineeringMath';

export interface ShapeReport {
  check: PrintShape | null;
  measure: MeshMeasure;
}

const localMeasures = new WeakMap<ShapeSolid, MeshMeasure>();
const printChecks = new WeakMap<ShapeSolid, PrintShape | null>();
const extraPoseCache = new WeakMap<ShapeSolid, Map<string, PrintPose>>();

function localMeasure(solid: ShapeSolid): MeshMeasure {
  const cached = localMeasures.get(solid);

  if (cached) return cached;

  const measure = { ...measureTriangles(solid.positions), sheet: detectSheet(solid.positions) };

  localMeasures.set(solid, measure);

  return measure;
}

function posesFor(solid: ShapeSolid, downs: Vec3[]): PrintPose[] {
  const cache = extraPoseCache.get(solid) ?? new Map<string, PrintPose>();
  const missing = new Map<string, Vec3>();

  extraPoseCache.set(solid, cache);

  const keys = downs.map((down) => {
    const key = down.map((x) => x.toFixed(5)).join(',');

    if (!cache.has(key) && !missing.has(key)) missing.set(key, down);

    return key;
  });

  if (missing.size) {
    const poses = extraPoses(solid.positions, solid.bvh, [...missing.values()]);

    [...missing.keys()].forEach((key, index) => cache.set(key, poses[index]));
  }

  return keys.map((key) => cache.get(key)!);
}

export function printReportOf(solid: ShapeSolid, downs: Vec3[] = []): ShapeReport {
  if (!printChecks.has(solid)) printChecks.set(solid, checkPrintability(solid.positions, solid.bvh));

  const base = printChecks.get(solid) ?? null;
  const check = base && downs.length ? { ...base, poses: [...base.poses, ...posesFor(solid, downs)] } : base;

  return { check, measure: localMeasure(solid) };
}

const BASE_BAND_MM = 1;

function baseOutline(pos: Float32Array, e: ArrayLike<number>, lowY: number): Array<[number, number]> {
  const points: Array<[number, number]> = [];

  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i];
    const y = pos[i + 1];
    const z = pos[i + 2];

    if (e[1] * x + e[5] * y + e[9] * z + e[13] > lowY + BASE_BAND_MM) continue;

    points.push([e[0] * x + e[4] * y + e[8] * z + e[12], e[2] * x + e[6] * y + e[10] * z + e[14]]);
  }

  return convexHull(points);
}

export function worldMeasure(solid: ShapeSolid, matrix: THREE.Matrix4): MeshMeasure {
  const local = localMeasure(solid);
  const e = matrix.elements;
  const pos = solid.positions;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i];
    const y = pos[i + 1];
    const z = pos[i + 2];

    for (let a = 0; a < 3; a++) {
      const v = e[a] * x + e[4 + a] * y + e[8 + a] * z + e[12 + a];

      min[a] = Math.min(min[a], v);
      max[a] = Math.max(max[a], v);
    }
  }

  const centroid = new THREE.Vector3(...local.centroid).applyMatrix4(matrix).toArray() as [number, number, number];

  return { ...local, min, max, centroid, base: pos.length ? baseOutline(pos, e, min[1]) : undefined };
}
