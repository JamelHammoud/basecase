import * as THREE from 'three';
import { measureTriangles, type MeshMeasure } from '../meshMeasure';
import { checkPrintability, type PrintCheck } from '../printability';
import type { ShapeSolid } from './shapeSolid';

export interface ShapeReport {
  check: PrintCheck | null;
  measure: MeshMeasure;
}

const localMeasures = new WeakMap<ShapeSolid, MeshMeasure>();
const printChecks = new WeakMap<ShapeSolid, PrintCheck | null>();

function localMeasure(solid: ShapeSolid): MeshMeasure {
  const cached = localMeasures.get(solid);

  if (cached) return cached;

  const measure = measureTriangles(solid.positions);

  localMeasures.set(solid, measure);

  return measure;
}

export function printReportOf(solid: ShapeSolid): ShapeReport {
  if (!printChecks.has(solid)) printChecks.set(solid, checkPrintability(solid.positions));

  return { check: printChecks.get(solid) ?? null, measure: localMeasure(solid) };
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
