import * as THREE from 'three';
import { measureTriangles, type MeshMeasure } from '../meshMeasure';
import { checkPrintability, extraPose, type PrintPose, type PrintShape, type Vec3 } from '../printability';
import type { ShapeSolid } from './shapeSolid';
import { convexHull } from '../../utils/engineeringMath';
import { detectSheet } from '../../sheet/detect';

export interface ShapeReport {
  check: PrintShape | null;
  measure: MeshMeasure;
}

const localMeasures = new WeakMap<ShapeSolid, MeshMeasure>();
const printChecks = new WeakMap<ShapeSolid, PrintShape | null>();
const extraPoses = new WeakMap<ShapeSolid, Map<string, PrintPose>>();

function localMeasure(solid: ShapeSolid): MeshMeasure {
  const cached = localMeasures.get(solid);

  if (cached) return cached;

  const plain = measureTriangles(solid.positions);
  const sheet = detectSheet(solid.positions);
  const measure = sheet ? { ...plain, sheet } : plain;

  localMeasures.set(solid, measure);

  return measure;
}

function posesFor(solid: ShapeSolid, downs: Vec3[]): PrintPose[] {
  const cache = extraPoses.get(solid) ?? new Map<string, PrintPose>();

  extraPoses.set(solid, cache);

  return downs.map((down) => {
    const key = down.map((x) => x.toFixed(5)).join(',');
    const pose = cache.get(key) ?? extraPose(solid.positions, solid.bvh, down);

    cache.set(key, pose);

    return pose;
  });
}

export function printReportOf(solid: ShapeSolid, downs: Vec3[] = []): ShapeReport {
  if (!printChecks.has(solid)) printChecks.set(solid, checkPrintability(solid.positions, solid.bvh));

  const base = printChecks.get(solid) ?? null;
  const check = base && downs.length ? { ...base, poses: [...base.poses, ...posesFor(solid, downs)] } : base;

  return { check, measure: localMeasure(solid) };
}

const BASE_BAND_MM = 1;

const worldAxis = (e: ArrayLike<number>, pos: Float32Array, i: number, a: number) =>
  e[a] * pos[i] + e[4 + a] * pos[i + 1] + e[8 + a] * pos[i + 2] + e[12 + a];

function baseOutline(pos: Float32Array, e: ArrayLike<number>, lowY: number): Array<[number, number]> {
  const points: Array<[number, number]> = [];

  for (let i = 0; i < pos.length; i += 3) {
    if (worldAxis(e, pos, i, 1) > lowY + BASE_BAND_MM) continue;

    points.push([worldAxis(e, pos, i, 0), worldAxis(e, pos, i, 2)]);
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
    for (let a = 0; a < 3; a++) {
      const v = worldAxis(e, pos, i, a);

      min[a] = Math.min(min[a], v);
      max[a] = Math.max(max[a], v);
    }
  }

  const centroid = new THREE.Vector3(...local.centroid).applyMatrix4(matrix).toArray() as [number, number, number];

  return { ...local, min, max, centroid, base: pos.length ? baseOutline(pos, e, min[1]) : undefined };
}
