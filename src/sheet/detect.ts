import { boundaryLoops, compareLoops, insideLoop, lowestPoint, signedArea, startAtLowest, type Point2 } from './loops';
import { MAX_STOCK_MM } from './materials';

export type { Point2 } from './loops';

export interface SheetProfile {
  thicknessMm: number;
  areaMm2: number;
  outline: Point2[];
  holes: Point2[][];
}

type V3 = [number, number, number];

const PLANE_MM = 0.01;
const FACING = 1 - 1e-4;
const SIDEWAYS = 1e-3;
const TINY_AREA = 1e-9;
const CANDIDATES = 3;
const MIN_THICKNESS_MM = 0.1;

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vertex = (t: ArrayLike<number>, i: number): V3 => [t[i], t[i + 1], t[i + 2]];
const round3 = (v: number) => Math.round(v * 1000) / 1000 + 0;

interface Faces {
  normals: V3[];
  areas: number[];
}

function facesOf(t: ArrayLike<number>): Faces {
  const normals: V3[] = [];
  const areas: number[] = [];

  for (let i = 0; i + 8 < t.length; i += 9) {
    const a = vertex(t, i);
    const b = vertex(t, i + 3);
    const c = vertex(t, i + 6);
    const n = cross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]);
    const length = Math.hypot(...n);

    normals.push(length ? [n[0] / length, n[1] / length, n[2] / length] : [0, 0, 0]);
    areas.push(length / 2);
  }

  return { normals, areas };
}

function canonical(n: V3): V3 {
  const abs = n.map(Math.abs);
  const k = abs.indexOf(Math.max(...abs));

  return n[k] < 0 ? [-n[0] + 0, -n[1] + 0, -n[2] + 0] : n;
}

function candidateAxes({ normals, areas }: Faces): V3[] {
  const order = areas.map((_, i) => i).sort((a, b) => areas[b] - areas[a] || a - b);
  const axes: V3[] = [];

  for (const i of order) {
    if (axes.length >= CANDIDATES || areas[i] <= TINY_AREA) break;

    const n = canonical(normals[i]);

    if (!axes.some((a) => Math.abs(dot(a, n)) >= FACING)) axes.push(n);
  }

  return axes;
}

function span(t: ArrayLike<number>, axis: V3) {
  let low = Infinity;
  let high = -Infinity;

  for (let i = 0; i + 2 < t.length; i += 3) {
    const d = dot(vertex(t, i), axis);

    low = Math.min(low, d);
    high = Math.max(high, d);
  }

  return { low, high };
}

function onPlane(t: ArrayLike<number>, tri: number, axis: V3, plane: number) {
  return [0, 3, 6].every((o) => Math.abs(dot(vertex(t, tri * 9 + o), axis) - plane) <= PLANE_MM);
}

function capsAlong(t: ArrayLike<number>, faces: Faces, axis: V3) {
  const { low, high } = span(t, axis);
  const top: number[] = [];
  let topArea = 0;
  let bottomArea = 0;

  for (let i = 0; i < faces.areas.length; i++) {
    const d = dot(faces.normals[i], axis);

    if (faces.areas[i] <= TINY_AREA || Math.abs(d) <= SIDEWAYS) continue;

    if (Math.abs(d) < FACING || !onPlane(t, i, axis, d > 0 ? high : low)) return null;

    if (d > 0) top.push(i);

    if (d > 0) topArea += faces.areas[i];
    else bottomArea += faces.areas[i];
  }

  const matched = topArea > 0 && Math.abs(topArea - bottomArea) <= topArea * 0.01;

  return matched ? { top, thicknessMm: high - low } : null;
}

function basis(axis: V3): [V3, V3] {
  const abs = axis.map(Math.abs);
  const k = abs.indexOf(Math.min(...abs));
  const ref: V3 = [0, 0, 0];

  ref[k] = 1;

  const along = dot(ref, axis);
  const raw: V3 = [ref[0] - along * axis[0], ref[1] - along * axis[1], ref[2] - along * axis[2]];
  const length = Math.hypot(...raw);
  const u: V3 = [raw[0] / length, raw[1] / length, raw[2] / length];

  return [u, cross(axis, u)];
}

function topTriangles(t: ArrayLike<number>, top: number[], axis: V3): Point2[][] {
  const [u, v] = basis(axis);

  return top.map((tri) =>
    [0, 3, 6].map((o) => {
      const p = vertex(t, tri * 9 + o);

      return [dot(p, u), dot(p, v)] as Point2;
    }),
  );
}

function profileOf(loops: Point2[][], thicknessMm: number): SheetProfile | null {
  const sorted = [...loops].sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));
  const [outline, ...holes] = sorted;

  if (!outline || signedArea(outline) <= 0) return null;

  if (holes.some((h) => signedArea(h) >= 0 || !insideLoop(outline, lowestPoint(h)))) return null;

  const minU = Math.min(...outline.map((p) => p[0]));
  const minV = Math.min(...outline.map((p) => p[1]));
  const place = (loop: Point2[]) => startAtLowest(loop.map(([x, y]) => [round3(x - minU), round3(y - minV)] as Point2));
  const placed = place(outline);
  const width = Math.max(...placed.map((p) => p[0]));
  const height = Math.max(...placed.map((p) => p[1]));

  if (thicknessMm * 2 >= Math.max(width, height)) return null;

  const placedHoles = holes.map(place).sort(compareLoops);
  const areaMm2 = signedArea(placed) + placedHoles.reduce((s, h) => s + signedArea(h), 0);

  return { thicknessMm: round3(thicknessMm), areaMm2: round3(areaMm2), outline: placed, holes: placedHoles };
}

function sheetAlong(t: ArrayLike<number>, faces: Faces, axis: V3): SheetProfile | null {
  const caps = capsAlong(t, faces, axis);

  if (!caps || caps.thicknessMm < MIN_THICKNESS_MM || caps.thicknessMm > MAX_STOCK_MM + PLANE_MM) return null;

  const loops = boundaryLoops(topTriangles(t, caps.top, axis));

  return loops ? profileOf(loops, caps.thicknessMm) : null;
}

export function detectSheet(triangles: ArrayLike<number>): SheetProfile | null {
  const faces = facesOf(triangles);

  for (const axis of candidateAxes(faces)) {
    const profile = sheetAlong(triangles, faces, axis);

    if (profile) return profile;
  }

  return null;
}
