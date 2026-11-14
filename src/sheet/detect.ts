import { boundaryLoops, canonicalLoop, signedArea, type Point2 } from './loops';
import { SHEET_MATERIALS } from './materials';

export type { Point2 } from './loops';

type Axis = 0 | 1 | 2;

export interface SheetProfile {
  axis: Axis;
  thicknessMm: number;
  outline: Point2[];
  holes: Point2[][];
  areaMm2: number;
}

const PLANE_AXES: Record<Axis, [number, number]> = { 0: [2, 1], 1: [0, 2], 2: [0, 1] };
const PARALLEL = 1e-4;
const AREA_MATCH = 0.005;
const LOOP_TOL_MM = 0.005;

export const MAX_THICKNESS_MM = Math.max(...Object.values(SHEET_MATERIALS).flatMap((m) => m.stockMm)) + 0.5;

type Vec3 = [number, number, number];

interface Faces {
  bottom: Point2[][];
  bottomArea: number;
  topArea: number;
}

function extents(t: Float32Array) {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < t.length; i++) {
    min[i % 3] = Math.min(min[i % 3], t[i]);
    max[i % 3] = Math.max(max[i % 3], t[i]);
  }

  return { min, size: max.map((v, i) => v - min[i]) as Vec3 };
}

function thinAxis(size: Vec3): Axis | null {
  const axis = size.indexOf(Math.min(...size)) as Axis;
  const others = size.filter((_, i) => i !== axis);

  if (size[axis] < 0.1 || size[axis] > MAX_THICKNESS_MM || size[axis] * 2 > Math.min(...others)) return null;

  return axis;
}

function normalOf(t: Float32Array, i: number): { n: Vec3; area: number } {
  const u = [t[i + 3] - t[i], t[i + 4] - t[i + 1], t[i + 5] - t[i + 2]];
  const w = [t[i + 6] - t[i], t[i + 7] - t[i + 1], t[i + 8] - t[i + 2]];
  const n: Vec3 = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  const len = Math.hypot(...n);

  return { n: len ? (n.map((v) => v / len) as Vec3) : n, area: len / 2 };
}

type Side = 'top' | 'bottom' | 'wall' | null;

function sideOf(t: Float32Array, i: number, plane: { axis: Axis; lo: number; hi: number; tol: number }): Side {
  const { n, area } = normalOf(t, i);

  if (area < 1e-9) return 'wall';

  if (Math.abs(n[plane.axis]) < PARALLEL) return 'wall';

  if (Math.abs(n[plane.axis]) < 1 - PARALLEL) return null;

  const heights = [t[i + plane.axis], t[i + 3 + plane.axis], t[i + 6 + plane.axis]];

  if (heights.every((h) => Math.abs(h - plane.lo) < plane.tol)) return 'bottom';

  return heights.every((h) => Math.abs(h - plane.hi) < plane.tol) ? 'top' : null;
}

function facesOf(t: Float32Array, axis: Axis, lo: number, thickness: number): Faces | null {
  const plane = { axis, lo, hi: lo + thickness, tol: Math.max(0.01, thickness * 1e-3) };
  const [u, v] = PLANE_AXES[axis];
  const faces: Faces = { bottom: [], bottomArea: 0, topArea: 0 };

  for (let i = 0; i + 8 < t.length; i += 9) {
    const side = sideOf(t, i, plane);

    if (!side) return null;

    if (side === 'top') faces.topArea += normalOf(t, i).area;

    if (side !== 'bottom') continue;

    faces.bottomArea += normalOf(t, i).area;
    faces.bottom.push([0, 3, 6].map((o) => [t[i + o + u], t[i + o + v]] as Point2));
  }

  return faces;
}

const close = (a: number, b: number) => Math.abs(a - b) <= AREA_MATCH * Math.max(a, b);

function profileLoops(faces: Faces): { outline: Point2[]; holes: Point2[][] } | null {
  const loops = boundaryLoops(faces.bottom, LOOP_TOL_MM);

  if (!loops?.length) return null;

  const winding = Math.sign(faces.bottom.reduce((s, tri) => s + signedArea(tri), 0));
  const outer = loops.filter((l) => Math.sign(signedArea(l)) === winding);
  const holes = loops.filter((l) => Math.sign(signedArea(l)) !== winding);

  if (outer.length !== 1) return null;

  const net = Math.abs(signedArea(outer[0])) - holes.reduce((s, h) => s + Math.abs(signedArea(h)), 0);

  return close(net, faces.bottomArea) ? { outline: outer[0], holes } : null;
}

export function detectSheet(triangles: Float32Array): SheetProfile | null {
  if (triangles.length < 9) return null;

  const { min, size } = extents(triangles);
  const axis = thinAxis(size);

  if (axis === null) return null;

  const faces = facesOf(triangles, axis, min[axis], size[axis]);

  if (!faces || faces.bottomArea <= 0 || !close(faces.bottomArea, faces.topArea)) return null;

  const loops = profileLoops(faces);

  if (!loops) return null;

  const [u, v] = PLANE_AXES[axis];
  const toOrigin = (p: Point2): Point2 => [p[0] - min[u], p[1] - min[v]];
  const holes = loops.holes
    .map((h) => canonicalLoop(h.map(toOrigin), false))
    .sort((a, b) => a[0][0] - b[0][0] || a[0][1] - b[0][1]);

  return {
    axis,
    thicknessMm: Math.round(size[axis] * 1000) / 1000,
    outline: canonicalLoop(loops.outline.map(toOrigin), true),
    holes,
    areaMm2: faces.bottomArea,
  };
}
