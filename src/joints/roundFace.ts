import { axisOfNormals, fitCircle, type Circle } from './cylinderFit';
import { curvedRims, type Region, type TriangleMesh } from './meshRegions';
import { add3, canonicalAxis, dot3, scale3, sub3, vertexAt, type Vec3 } from './vec3';

export interface RoundFace {
  origin: Vec3;
  axis: Vec3;
  radius: number;
  span: [number, number];
}

const MAX_RMS = 0.05;
const ON_CIRCLE = 0.1;
const MAX_TILT = Math.sin((10 * Math.PI) / 180);
const REFINE_PASSES = 2;

interface Cylinder {
  axis: Vec3;
  circle: Circle;
}

function verticesOf(mesh: TriangleMesh, tris: number[]): number[] {
  const ids = new Set<number>();

  for (const t of tris)
    ids
      .add(mesh.corners[t * 3])
      .add(mesh.corners[t * 3 + 1])
      .add(mesh.corners[t * 3 + 2]);

  return [...ids];
}

const isRound = (circle: Circle | null): circle is Circle => !!circle && circle.rms <= MAX_RMS * circle.radius;

const roundness = (circle: Circle) => circle.rms / circle.radius;

function firstCircle(mesh: TriangleMesh, region: Region, seed: number, axis: Vec3): Circle | null {
  const rims = curvedRims(mesh, region, seed);
  const candidates = [rims.local, rims.whole, verticesOf(mesh, region.tris)]
    .map((vertices) => fitCircle(mesh, vertices, axis))
    .filter(isRound);

  return candidates.sort((a, b) => roundness(a) - roundness(b))[0] ?? null;
}

function radialGap(point: Vec3, { axis, circle }: Cylinder): number {
  const offset = sub3(point, circle.center);
  const radial = sub3(offset, scale3(axis, dot3(offset, axis)));

  return Math.abs(Math.hypot(...radial) - circle.radius);
}

function onCylinder(mesh: TriangleMesh, t: number, cylinder: Cylinder): boolean {
  if (Math.abs(dot3(vertexAt(mesh.normals, t), cylinder.axis)) >= MAX_TILT) return false;

  const limit = ON_CIRCLE * cylinder.circle.radius;

  return [0, 1, 2].every((k) => radialGap(vertexAt(mesh.positions, mesh.corners[t * 3 + k]), cylinder) <= limit);
}

function refit(mesh: TriangleMesh, tris: number[]): Cylinder | null {
  const axis = tris.length ? axisOfNormals(mesh, tris) : null;
  const circle = axis && fitCircle(mesh, verticesOf(mesh, tris), axis);

  return axis && circle ? { axis, circle } : null;
}

function faceOf(mesh: TriangleMesh, tris: number[], cylinder: Cylinder): RoundFace {
  const axis = canonicalAxis(cylinder.axis);
  const along = verticesOf(mesh, tris).map((id) => dot3(vertexAt(mesh.positions, id), axis));
  const [low, high] = along.reduce(([lo, hi], t) => [Math.min(lo, t), Math.max(hi, t)], [Infinity, -Infinity]);
  const middle = (low + high) / 2;
  const centre = cylinder.circle.center;

  return {
    origin: add3(centre, scale3(axis, middle - dot3(centre, axis))),
    axis,
    radius: cylinder.circle.radius,
    span: [low - middle, high - middle],
  };
}

export function fitRoundFace(
  mesh: TriangleMesh,
  region: Region,
  pick: { seed: number; mustContainSeed: boolean },
): RoundFace | null {
  const axis = axisOfNormals(mesh, region.tris);
  const circle = axis && firstCircle(mesh, region, pick.seed, axis);
  let cylinder = axis && circle ? { axis, circle } : null;
  let tris = region.tris;

  for (let pass = 0; pass < REFINE_PASSES && cylinder; pass++) {
    const current: Cylinder = cylinder;

    tris = region.tris.filter((t) => onCylinder(mesh, t, current));
    cylinder = refit(mesh, tris);
  }

  if (!cylinder || !isRound(cylinder.circle)) return null;

  if (pick.mustContainSeed && !tris.includes(pick.seed)) return null;

  return faceOf(mesh, tris, cylinder);
}
