import { closestTriangle } from './closestTriangle';
import { buildMesh, growRegion, smoothRegions } from './meshRegions';
import { fitRoundFace, type RoundFace } from './roundFace';
import { add3, dot3, lineDistance3, normalize3, scale3, sub3, type Vec3 } from './vec3';

export type { Vec3 } from './vec3';
export type { RoundFace } from './roundFace';

const PARALLEL_COS = Math.cos(Math.PI / 180);
const MAX_LINE_GAP = 0.5;
const RADIUS_SLACK = 0.5;
const RADIUS_SHARE = 0.1;
const MIN_OVERLAP = 1e-6;
const MIN_REGION = 4;
const MIN_TRAVEL = 1;

interface CoaxialMatch {
  face: RoundFace;
  radiusGap: number;
  lineGap: number;
}

export function roundFaceAt(soup: ArrayLike<number>, point: Vec3): RoundFace | null {
  const mesh = buildMesh(soup);
  const seed = closestTriangle(mesh, point);

  if (seed < 0) return null;

  const region = growRegion(mesh, seed, new Int32Array(mesh.triCount).fill(-1), 0);

  return fitRoundFace(mesh, region, { seed, mustContainSeed: true });
}

function roundFacesOf(soup: ArrayLike<number>): RoundFace[] {
  const mesh = buildMesh(soup);

  return smoothRegions(mesh)
    .filter((region) => region.tris.length >= MIN_REGION)
    .map((region) => fitRoundFace(mesh, region, { seed: region.tris[0], mustContainSeed: false }))
    .filter((face): face is RoundFace => face !== null);
}

function overlapOnChild(parent: RoundFace, child: RoundFace): [number, number] {
  const shift = dot3(sub3(parent.origin, child.origin), child.axis);
  const direction = Math.sign(dot3(parent.axis, child.axis));
  const ends = parent.span.map((end) => shift + direction * end);

  return [Math.max(Math.min(...ends), child.span[0]), Math.min(Math.max(...ends), child.span[1])];
}

function coaxialMatch(parent: RoundFace, child: RoundFace): CoaxialMatch | null {
  const radiusGap = Math.abs(parent.radius - child.radius);
  const lineGap = lineDistance3(child.origin, parent.origin, parent.axis);
  const radiusLimit = Math.max(RADIUS_SLACK, RADIUS_SHARE * Math.max(parent.radius, child.radius));

  if (Math.abs(dot3(parent.axis, child.axis)) < PARALLEL_COS || lineGap > MAX_LINE_GAP || radiusGap > radiusLimit) {
    return null;
  }

  const [low, high] = overlapOnChild(parent, child);

  if (high - low <= MIN_OVERLAP) return null;

  const middle = (low + high) / 2;
  const face: RoundFace = {
    origin: add3(child.origin, scale3(child.axis, middle)),
    axis: child.axis,
    radius: child.radius,
    span: [low - middle, high - middle],
  };

  return { face, radiusGap, lineGap };
}

export function sharedAxis(parent: ArrayLike<number>, child: ArrayLike<number>): RoundFace | null {
  const childFaces = roundFacesOf(child);

  if (!childFaces.length) return null;

  const matches = roundFacesOf(parent)
    .flatMap((p) => childFaces.map((c) => coaxialMatch(p, c)))
    .filter((match): match is CoaxialMatch => match !== null)
    .sort((a, b) => a.radiusGap - b.radiusGap || a.lineGap - b.lineGap);

  return matches[0]?.face ?? null;
}

function extentAlong(soup: ArrayLike<number>, origin: Vec3, axis: Vec3): [number, number] {
  let low = Infinity;
  let high = -Infinity;

  for (let i = 0; i + 2 < soup.length; i += 3) {
    const t =
      (soup[i] - origin[0]) * axis[0] + (soup[i + 1] - origin[1]) * axis[1] + (soup[i + 2] - origin[2]) * axis[2];

    low = Math.min(low, t);
    high = Math.max(high, t);
  }

  return low <= high ? [low, high] : [0, 0];
}

const tenth = (value: number) => Math.round(value * 10) / 10 || 0;

export function slideTravel(
  parent: ArrayLike<number>,
  child: ArrayLike<number>,
  axis: { origin: Vec3; axis: Vec3 },
): [number, number] {
  const direction = normalize3(axis.axis);
  const [parentMin, parentMax] = extentAlong(parent, axis.origin, direction);
  const [childMin, childMax] = extentAlong(child, axis.origin, direction);
  const ends = [parentMin - childMin, parentMax - childMax];
  const low = Math.min(0, ...ends);
  const high = Math.max(0, ...ends);
  const length = childMax - childMin;

  return high - low < MIN_TRAVEL ? [tenth(-length), tenth(length)] : [tenth(low), tenth(high)];
}
