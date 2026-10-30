import * as THREE from 'three';
import { measureTriangles, type MeshMeasure } from '../meshMeasure';
import { checkPrintability, extraPose, type PrintPose, type PrintShape, type Vec3 } from '../printability';
import type { ShapeSolid } from './shapeSolid';

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

  const measure = measureTriangles(solid.positions);

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

export function worldMeasure(solid: ShapeSolid, matrix: THREE.Matrix4): MeshMeasure {
  const local = localMeasure(solid);
  const e = matrix.elements;
  const pos = solid.positions;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < pos.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      const v = e[a] * pos[i] + e[4 + a] * pos[i + 1] + e[8 + a] * pos[i + 2] + e[12 + a];

      min[a] = Math.min(min[a], v);
      max[a] = Math.max(max[a], v);
    }
  }

  const centroid = new THREE.Vector3(...local.centroid).applyMatrix4(matrix).toArray() as [number, number, number];

  return { ...local, min, max, centroid };
}
