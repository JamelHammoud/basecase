import { isValidTriangle, type TriangleMesh } from './meshRegions';
import { add3, cross3, dot3, length3, scale3, sub3, vertexAt, type Vec3 } from './vec3';

function segmentDistanceSq(p: Vec3, a: Vec3, b: Vec3): number {
  const ab = sub3(b, a);
  const t = Math.min(1, Math.max(0, dot3(sub3(p, a), ab) / (dot3(ab, ab) || 1)));
  const gap = sub3(p, add3(a, scale3(ab, t)));

  return dot3(gap, gap);
}

const insideEdge = (q: Vec3, from: Vec3, to: Vec3, normal: Vec3) =>
  dot3(cross3(sub3(to, from), sub3(q, from)), normal) >= 0;

function triangleDistanceSq(p: Vec3, [a, b, c]: Vec3[], normal: Vec3): number {
  const height = dot3(sub3(p, a), normal);
  const foot = sub3(p, scale3(normal, height));

  if (insideEdge(foot, a, b, normal) && insideEdge(foot, b, c, normal) && insideEdge(foot, c, a, normal)) {
    return height * height;
  }

  return Math.min(segmentDistanceSq(p, a, b), segmentDistanceSq(p, b, c), segmentDistanceSq(p, c, a));
}

function lowerBound(p: Vec3, corners: Vec3[]): number {
  const centre = scale3(add3(add3(corners[0], corners[1]), corners[2]), 1 / 3);
  const reach = Math.max(...corners.map((corner) => length3(sub3(corner, centre))));
  const gap = Math.max(0, length3(sub3(p, centre)) - reach);

  return gap * gap;
}

export function closestTriangle(mesh: TriangleMesh, point: Vec3): number {
  let best = -1;
  let bestDistance = Infinity;

  for (let t = 0; t < mesh.triCount; t++) {
    if (!isValidTriangle(mesh, t)) continue;

    const corners = [0, 1, 2].map((k) => vertexAt(mesh.positions, mesh.corners[t * 3 + k]));

    if (lowerBound(point, corners) >= bestDistance) continue;

    const distance = triangleDistanceSq(point, corners, vertexAt(mesh.normals, t));

    if (distance < bestDistance) [best, bestDistance] = [t, distance];
  }

  return best;
}
