import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PartEdges } from '../../types/robotics';
import type { Outline } from '../../utils/partEdges';
import { cornerDirs, edgeLayers, insetCorner, outlineCorners, type Corner, type Vec2 } from './edgedProfile';

type V3 = [number, number, number];

const CREASE = THREE.MathUtils.degToRad(25);
const LATHE_SEGMENTS = 48;
const LATHE_DIRECTIONS = Array.from({ length: LATHE_SEGMENTS + 1 }, (_, i): Vec2 => {
  const theta = (i / LATHE_SEGMENTS) * Math.PI * 2;

  return [Math.sin(theta), Math.cos(theta)];
});
const DEFORM_LAYERS = 16;
const MIN_AREA = 1e-9;
const CACHE_SIZE = 64;

const cache = new Map<string, { position: Float32Array; normal: Float32Array }>();

class Triangles {
  readonly values: number[] = [];

  add(a: V3, b: V3, c: V3) {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    const area = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);

    if (area > MIN_AREA) this.values.push(...a, ...b, ...c);
  }

  quad(a: V3, b: V3, c: V3, d: V3) {
    this.add(a, b, c);
    this.add(a, c, d);
  }
}

function placePrismRing(ring: V3[], corners: Corner[], [y, reach]: Vec2) {
  let i = 0;

  for (const { center, dirs } of corners) {
    for (const dir of dirs) {
      const vertex = ring[i++];

      vertex[0] = center[0] + dir[0] * reach;
      vertex[1] = y;
      vertex[2] = center[1] + dir[1] * reach;
    }
  }
}

export function prismTriangles(outline: Outline, height: number, edges: PartEdges, middle: number): number[] {
  const corners = outlineCorners(outline, edges);
  const layers = edgeLayers(height, edges, middle);
  const out = new Triangles();
  let low = corners.flatMap(({ dirs }) => dirs.map((): V3 => [0, 0, 0]));
  let high = low.map((): V3 => [0, 0, 0]);

  placePrismRing(low, corners, layers[0]);

  for (let k = 1; k < layers.length; k++) {
    placePrismRing(high, corners, layers[k]);

    low.forEach((a, j) => {
      const next = (j + 1) % low.length;

      out.quad(a, low[next], high[next], high[j]);
    });

    const previous = low;

    low = high;
    high = previous;
  }

  const cap = corners.map(({ center }) => center);

  for (let i = 1; i + 1 < cap.length; i++) {
    const [a, b, c] = [cap[0], cap[i], cap[i + 1]];

    out.add([a[0], height / 2, a[1]], [b[0], height / 2, b[1]], [c[0], height / 2, c[1]]);
    out.add([a[0], -height / 2, a[1]], [c[0], -height / 2, c[1]], [b[0], -height / 2, b[1]]);
  }

  return out.values;
}

type ProfileCorner = { at: Vec2; from: Vec2; to: Vec2; mm: number };

function profilePoints(corners: ProfileCorner[], kind: PartEdges['kind']): Vec2[] {
  return corners.flatMap(({ at, from, to, mm }) => {
    if (mm <= 0) return [at];

    const center = insetCorner(at, [from, to], mm);

    return cornerDirs(from, to, kind).map((d): Vec2 => [center[0] + d[0] * mm, center[1] + d[1] * mm]);
  });
}

function densified(points: Vec2[], parts: number, closed: boolean): Vec2[] {
  if (parts <= 1) return points;

  return points.flatMap((p, i) => {
    const q = points[i + 1] ?? (closed ? points[0] : null);

    if (!q || Math.abs(q[0] - p[0]) > 1e-6) return [p];

    return Array.from({ length: parts }, (_, s): Vec2 => [
      p[0] + ((q[0] - p[0]) * s) / parts,
      p[1] + ((q[1] - p[1]) * s) / parts,
    ]);
  });
}

function placeRing(ring: V3[], [u, y]: Vec2) {
  for (let i = 0; i < ring.length; i++) {
    ring[i][0] = u * LATHE_DIRECTIONS[i][0];
    ring[i][1] = y;
    ring[i][2] = u * LATHE_DIRECTIONS[i][1];
  }
}

export function latheTriangles(profile: Vec2[], closed: boolean): number[] {
  const out = new Triangles();
  const spans = closed ? profile.length : profile.length - 1;

  if (spans <= 0) return out.values;

  let low = LATHE_DIRECTIONS.map((): V3 => [0, 0, 0]);
  let high = LATHE_DIRECTIONS.map((): V3 => [0, 0, 0]);

  placeRing(low, profile[0]);

  for (let j = 0; j < spans; j++) {
    placeRing(high, profile[(j + 1) % profile.length]);

    for (let i = 0; i < LATHE_SEGMENTS; i++) out.quad(low[i], low[i + 1], high[i + 1], high[i]);

    const previous = low;

    low = high;
    high = previous;
  }

  return out.values;
}

function cylinderProfile(radius: number, height: number, edges: PartEdges): Vec2[] {
  const h = height / 2;

  return profilePoints(
    [
      { at: [0, -h], from: [0, -1], to: [0, -1], mm: 0 },
      { at: [radius, -h], from: [0, -1], to: [1, 0], mm: edges.mm },
      { at: [radius, h], from: [1, 0], to: [0, 1], mm: edges.mm },
      { at: [0, h], from: [0, 1], to: [0, 1], mm: 0 },
    ],
    edges.kind,
  );
}

function tubeProfile(radii: { outer: number; inner: number }, height: number, edges: PartEdges): Vec2[] {
  const h = height / 2;
  const { outer, inner } = radii;

  return profilePoints(
    [
      { at: [outer, -h], from: [0, -1], to: [1, 0], mm: edges.mm },
      { at: [outer, h], from: [1, 0], to: [0, 1], mm: edges.mm },
      { at: [inner, h], from: [0, 1], to: [-1, 0], mm: edges.mm },
      { at: [inner, -h], from: [-1, 0], to: [0, -1], mm: edges.mm },
    ],
    edges.kind,
  );
}

function remember(key: string, build: () => number[]) {
  const hit = cache.get(key);

  if (hit) {
    cache.delete(key);
    cache.set(key, hit);

    return hit;
  }

  const plain = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(build(), 3));
  const smooth = toCreasedNormals(plain, CREASE);
  const entry = {
    position: smooth.getAttribute('position').array as Float32Array,
    normal: smooth.getAttribute('normal').array as Float32Array,
  };

  cache.set(key, entry);

  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);

  return entry;
}

function geometryFor(key: string, build: () => number[]): THREE.BufferGeometry {
  const { position, normal } = remember(key, build);

  return new THREE.BufferGeometry()
    .setAttribute('position', new THREE.BufferAttribute(position.slice(), 3))
    .setAttribute('normal', new THREE.BufferAttribute(normal.slice(), 3));
}

const keyOf = (shape: string, values: number[], edges: PartEdges, deformed: boolean) =>
  `${shape}|${values.map((v) => v.toFixed(3)).join(',')}|${edges.kind}:${edges.mm}|${deformed ? 'd' : ''}`;

export interface EdgedPrism {
  outline: Outline;
  height: number;
  edges: PartEdges;
  deformed: boolean;
}

export function edgedPrism({ outline, height, edges, deformed }: EdgedPrism): THREE.BufferGeometry {
  const key = keyOf('prism', [...outline.flat(), height], edges, deformed);

  return geometryFor(key, () => prismTriangles(outline, height, edges, deformed ? DEFORM_LAYERS : 1));
}

export interface EdgedLathe {
  radii: { outer: number; inner: number } | number;
  height: number;
  edges: PartEdges;
  deformed: boolean;
}

export function edgedLathe({ radii, height, edges, deformed }: EdgedLathe): THREE.BufferGeometry {
  const tube = typeof radii !== 'number';
  const values = tube ? [radii.outer, radii.inner, height] : [radii, height];
  const parts = deformed ? DEFORM_LAYERS : 1;

  return geometryFor(keyOf(tube ? 'tube' : 'cylinder', values, edges, deformed), () =>
    tube
      ? latheTriangles(densified(tubeProfile(radii, height, edges), parts, true), true)
      : latheTriangles(densified(cylinderProfile(radii, height, edges), parts, false), false),
  );
}
