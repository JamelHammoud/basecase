import { solveLinear } from '../reality/leastSquares';
import { symmetricEigen } from './eigen3';
import type { TriangleMesh } from './meshRegions';
import { add3, dot3, perpendicularBasis, scale3, vertexAt, type Vec3 } from './vec3';

const MIN_AROUND = 0.05;
const MAX_ALONG = 0.01;

export interface Circle {
  center: Vec3;
  radius: number;
  rms: number;
}

export function axisOfNormals(mesh: TriangleMesh, tris: number[]): Vec3 | null {
  const m = new Array<number>(9).fill(0);

  for (const t of tris) {
    const n = vertexAt(mesh.normals, t);
    const w = mesh.areas[t];

    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) m[i * 3 + j] += w * n[i] * n[j];
    }
  }

  const { values, vectors } = symmetricEigen(m);
  const largest = values[2];

  if (!Number.isFinite(largest) || largest <= 0 || values[1] / largest < MIN_AROUND || values[0] / largest > MAX_ALONG)
    return null;

  return vectors[0];
}

function kasa(points: number[][]): { x: number; y: number; radius: number } | null {
  const ata = [0, 1, 2].map(() => [0, 0, 0]);
  const atb = [0, 0, 0];

  for (const [x, y] of points) {
    const row = [x, y, 1];
    const rhs = -(x * x + y * y);

    for (let i = 0; i < 3; i++) {
      atb[i] += row[i] * rhs;

      for (let j = 0; j < 3; j++) ata[i][j] += row[i] * row[j];
    }
  }

  const solution = solveLinear(ata, atb);

  if (!solution) return null;

  const [d, e, f] = solution;
  const [x, y] = [-d / 2, -e / 2];
  const radius = Math.sqrt(x * x + y * y - f);

  return Number.isFinite(radius) && radius > 0 ? { x, y, radius } : null;
}

export function fitCircle(mesh: TriangleMesh, vertices: number[], axis: Vec3): Circle | null {
  if (vertices.length < 3) return null;

  const [u, v] = perpendicularBasis(axis);
  const planar = vertices.map((id) => {
    const p = vertexAt(mesh.positions, id);

    return [dot3(p, u), dot3(p, v)];
  });
  const mean = planar.reduce((sum, [x, y]) => [sum[0] + x, sum[1] + y], [0, 0]).map((s) => s / planar.length);
  const centred = planar.map(([x, y]) => [x - mean[0], y - mean[1]]);
  const fit = kasa(centred);

  if (!fit) return null;

  const squares = centred.reduce((sum, [x, y]) => sum + (Math.hypot(x - fit.x, y - fit.y) - fit.radius) ** 2, 0);

  return {
    center: add3(scale3(u, fit.x + mean[0]), scale3(v, fit.y + mean[1])),
    radius: fit.radius,
    rms: Math.sqrt(squares / centred.length),
  };
}
