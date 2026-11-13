import type { Sketch, SketchArc, SketchCircle, SketchLine, Vec2 } from './types';

export interface Profile {
  outer: Vec2[];
  holes: Vec2[][];
}

type Edge = SketchLine | SketchArc;

const CIRCLE_SEGMENTS = 64;
const ARC_STEP = Math.PI / 36;

const TAU = Math.PI * 2;

export function arcSweep(center: Vec2, from: Vec2, to: Vec2) {
  const start = Math.atan2(from[1] - center[1], from[0] - center[0]);
  const end = Math.atan2(to[1] - center[1], to[0] - center[0]);
  const sweep = (((end - start) % TAU) + TAU) % TAU;

  return { start, sweep: sweep === 0 ? TAU : sweep };
}

export function arcPoints(center: Vec2, from: Vec2, to: Vec2): Vec2[] {
  const r = Math.hypot(from[0] - center[0], from[1] - center[1]);
  const { start, sweep } = arcSweep(center, from, to);
  const steps = Math.max(4, Math.ceil(sweep / ARC_STEP));
  const out: Vec2[] = [];

  for (let i = 0; i <= steps; i++) {
    const a = start + (sweep * i) / steps;

    out.push([center[0] + r * Math.cos(a), center[1] + r * Math.sin(a)]);
  }

  return out;
}

export function circlePoints(center: Vec2, r: number): Vec2[] {
  return Array.from({ length: CIRCLE_SEGMENTS }, (_, i) => {
    const a = (i / CIRCLE_SEGMENTS) * TAU;

    return [center[0] + r * Math.cos(a), center[1] + r * Math.sin(a)] as Vec2;
  });
}

export const loopArea = (loop: Vec2[]) =>
  loop.reduce((s, [x, y], i) => {
    const [nx, ny] = loop[(i + 1) % loop.length];

    return s + x * ny - nx * y;
  }, 0) / 2;

export function insideLoop([px, py]: Vec2, loop: Vec2[]) {
  let inside = false;

  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const [xi, yi] = loop[i];
    const [xj, yj] = loop[j];

    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }

  return inside;
}

const otherEnd = (edge: Edge, at: string) => (edge.a === at ? edge.b : edge.a);

function edgePoints(edge: Edge, from: string, point: (id: string) => Vec2): Vec2[] {
  if (edge.kind === 'line') return [point(from)];

  const pts = arcPoints(point(edge.c), point(edge.a), point(edge.b));
  const ordered = from === edge.a ? pts : [...pts].reverse();

  return ordered.slice(0, -1);
}

function walkLoop(start: Edge, byPoint: Map<string, Edge[]>, used: Set<string>, point: (id: string) => Vec2) {
  const out: Vec2[] = [];
  const origin = start.a;
  let edge: Edge | undefined = start;
  let at = origin;

  while (edge) {
    used.add(edge.id);
    out.push(...edgePoints(edge, at, point));
    at = otherEnd(edge, at);

    if (at === origin) return out;

    edge = (byPoint.get(at) ?? []).find((e) => !used.has(e.id));
  }

  return null;
}

function edgeLoops(sketch: Sketch, point: (id: string) => Vec2): Vec2[][] {
  const edges = sketch.entities.filter((e): e is Edge => (e.kind === 'line' && !e.ref) || e.kind === 'arc');
  const byPoint = new Map<string, Edge[]>();

  for (const e of edges) {
    for (const id of [e.a, e.b]) byPoint.set(id, [...(byPoint.get(id) ?? []), e]);
  }

  const used = new Set<string>();
  const loops: Vec2[][] = [];

  for (const e of edges) {
    if (used.has(e.id)) continue;

    const loop = walkLoop(e, byPoint, used, point);

    if (loop && loop.length >= 3) loops.push(loop);
  }

  return loops;
}

export function sketchLoops(sketch: Sketch): Vec2[][] {
  const points = new Map(sketch.points.map((p) => [p.id, [p.x, p.y] as Vec2]));
  const point = (id: string) => points.get(id) ?? [0, 0];
  const circles = sketch.entities
    .filter((e): e is SketchCircle => e.kind === 'circle')
    .map((c) => circlePoints(point(c.c), c.r));

  return [...edgeLoops(sketch, point), ...circles];
}

export function sketchProfile(sketch: Sketch): Profile | null {
  const loops = sketchLoops(sketch).filter((l) => Math.abs(loopArea(l)) > 1e-6);

  if (loops.length === 0) return null;

  const outer = loops.reduce((best, l) => (Math.abs(loopArea(l)) > Math.abs(loopArea(best)) ? l : best));
  const holes = loops.filter((l) => l !== outer && insideLoop(l[0], outer));

  return { outer, holes };
}

export function loopBounds(loop: Vec2[]) {
  const xs = loop.map((p) => p[0]);
  const ys = loop.map((p) => p[1]);

  return { min: [Math.min(...xs), Math.min(...ys)] as Vec2, max: [Math.max(...xs), Math.max(...ys)] as Vec2 };
}
