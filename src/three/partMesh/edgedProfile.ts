import type { PartEdges } from '../../types/robotics';
import type { Outline } from '../../utils/partEdges';

export type Vec2 = [number, number];

const FILLET_STEP = Math.PI / 16;

export const QUARTER_STEPS = Math.ceil(Math.PI / 2 / FILLET_STEP);

export interface Corner {
  center: Vec2;
  dirs: Vec2[];
}

function edgeNormal(a: Vec2, b: Vec2): Vec2 {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;

  return [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
}

export function cornerDirs(from: Vec2, to: Vec2, kind: PartEdges['kind']): Vec2[] {
  if (kind === 'chamfer') return [from, to];

  const start = Math.atan2(from[1], from[0]);
  let turn = Math.atan2(to[1], to[0]) - start;

  if (turn > Math.PI) turn -= 2 * Math.PI;

  if (turn < -Math.PI) turn += 2 * Math.PI;

  const steps = Math.max(1, Math.ceil(Math.abs(turn) / FILLET_STEP));

  return Array.from({ length: steps + 1 }, (_, i) => {
    const angle = start + (turn * i) / steps;

    return [Math.cos(angle), Math.sin(angle)];
  });
}

export function insetCorner(at: Vec2, normals: [Vec2, Vec2], mm: number): Vec2 {
  const [a, b] = normals;
  const scale = mm / (1 + a[0] * b[0] + a[1] * b[1]);

  return [at[0] - (a[0] + b[0]) * scale, at[1] - (a[1] + b[1]) * scale];
}

const signedArea = (outline: Outline) =>
  outline.reduce((sum, [x, z], i) => {
    const [nx, nz] = outline[(i + 1) % outline.length];

    return sum + x * nz - nx * z;
  }, 0);

export function clockwise(outline: Outline): Outline {
  return signedArea(outline) > 0 ? [...outline].reverse() : outline;
}

export function outlineCorners(outline: Outline, edges: PartEdges): Corner[] {
  const ring = clockwise(outline);

  return ring.map((at, i) => {
    const prev = ring[(i + ring.length - 1) % ring.length];
    const next = ring[(i + 1) % ring.length];
    const normals: [Vec2, Vec2] = [edgeNormal(prev, at), edgeNormal(at, next)];

    return { center: insetCorner(at, normals, edges.mm), dirs: cornerDirs(normals[0], normals[1], edges.kind) };
  });
}

export const contourAt = (corners: Corner[], reach: number): Vec2[] =>
  corners.flatMap(({ center, dirs }) => dirs.map((d): Vec2 => [center[0] + d[0] * reach, center[1] + d[1] * reach]));

export function edgeLayers(height: number, edges: PartEdges, middle: number): Array<[number, number]> {
  const flat = height / 2 - edges.mm;
  const steps = edges.kind === 'chamfer' ? 1 : QUARTER_STEPS;
  const rim = Array.from({ length: steps + 1 }, (_, i): [number, number] => {
    const phi = ((steps - i) / steps) * (Math.PI / 2);

    return edges.kind === 'chamfer'
      ? [flat + edges.mm * (1 - i), edges.mm * i]
      : [flat + edges.mm * Math.sin(phi), edges.mm * Math.cos(phi)];
  });
  const top = [...rim].reverse();
  const sides = Array.from({ length: middle - 1 }, (_, i): [number, number] => [
    -flat + (2 * flat * (i + 1)) / middle,
    edges.mm,
  ]);
  const bottom = rim.map(([y, reach]): [number, number] => [-y, reach]);

  return [...bottom, ...sides, ...top];
}
