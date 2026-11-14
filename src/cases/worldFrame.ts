import type { V3 } from '../utils/kinematics';

export interface Box {
  min: V3;
  max: V3;
}

export const MM_PER_M = 1000;
export const MM_FILE_EXTENT = 200;
export const FLOOR_BIN_MM = 20;
export const FLOOR_TILT_DEG = 10;

const FLOOR_COS = Math.cos((FLOOR_TILT_DEG * Math.PI) / 180);

export const mmPerUnit = (extent: number) => (extent > MM_FILE_EXTENT ? 1 : MM_PER_M);

export function boxOf(positions: ArrayLike<number>): Box {
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < positions.length; i++) {
    const k = i % 3;

    min[k] = Math.min(min[k], positions[i]);
    max[k] = Math.max(max[k], positions[i]);
  }

  return { min, max };
}

export const boxAround = (points: ArrayLike<number>[]): Box => boxOf(points.flatMap((p) => [p[0], p[1], p[2]]));

export const sidesOf = ({ min, max }: Box): V3 => [max[0] - min[0], max[1] - min[1], max[2] - min[2]];

export const largestSide = (box: Box) => Math.max(...sidesOf(box));

export const horizontalSide = (box: Box) => {
  const [x, , z] = sidesOf(box);

  return Math.max(x, z);
};

export const PLANE_SHARE = 0.2;

interface Triangle {
  area: number;
  up: number;
  height: number;
}

interface Plane {
  area: number;
  height: number;
}

function triangleAt(p: ArrayLike<number>, indices: ArrayLike<number>, t: number): Triangle {
  const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]];
  const [ux, uy, uz] = [p[b * 3] - p[a * 3], p[b * 3 + 1] - p[a * 3 + 1], p[b * 3 + 2] - p[a * 3 + 2]];
  const [vx, vy, vz] = [p[c * 3] - p[a * 3], p[c * 3 + 1] - p[a * 3 + 1], p[c * 3 + 2] - p[a * 3 + 2]];
  const [nx, ny, nz] = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
  const length = Math.hypot(nx, ny, nz);

  return {
    area: length / 2,
    up: length > 0 ? ny / length : 0,
    height: (p[a * 3 + 1] + p[b * 3 + 1] + p[c * 3 + 1]) / 3,
  };
}

function triangles(positions: ArrayLike<number>, indices: ArrayLike<number>): Triangle[] {
  const out: Triangle[] = [];

  for (let t = 0; t + 2 < indices.length; t += 3) out.push(triangleAt(positions, indices, t));

  return out;
}

function largestPlane(all: Triangle[], facing: 1 | -1): Plane | undefined {
  const bins = new Map<number, Plane>();

  for (const { area, up, height } of all) {
    if (area <= 0 || up * facing < FLOOR_COS) continue;

    const key = Math.floor(height / FLOOR_BIN_MM);
    const bin = bins.get(key) ?? { area: 0, height: 0 };

    bin.area += area;
    bin.height += area * height;
    bins.set(key, bin);
  }

  const best = [...bins.values()].reduce<Plane | undefined>(
    (top, bin) => (top && top.area >= bin.area ? top : bin),
    undefined,
  );

  return best && { area: best.area, height: best.height / best.area };
}

export function floorHeight(positions: ArrayLike<number>, indices: ArrayLike<number>): number | undefined {
  return largestPlane(triangles(positions, indices), 1)?.height;
}

function clutterNear(all: Triangle[], from: number, to: number): number {
  const [low, high] = [Math.min(from, to), Math.max(from, to)];
  const reach = (high - low) / 3;

  return all
    .filter((t) => Math.abs(t.up) < FLOOR_COS && t.height > low && t.height < high)
    .filter((t) => Math.abs(t.height - from) < reach)
    .reduce((sum, t) => sum + t.area, 0);
}

function floorFacing(all: Triangle[], up: Plane, down: Plane): 1 | -1 | 0 {
  const nearUp = clutterNear(all, up.height, down.height);
  const nearDown = clutterNear(all, down.height, up.height);

  if (nearUp === nearDown) return 0;

  return nearUp > nearDown ? 1 : -1;
}

const significant = (plane: Plane | undefined, other: Plane | undefined) =>
  !!plane && plane.area >= PLANE_SHARE * (other?.area ?? 0);

export function isUpsideDown(positions: ArrayLike<number>, indices: ArrayLike<number>): boolean {
  const all = triangles(positions, indices);
  const up = largestPlane(all, 1);
  const down = largestPlane(all, -1);
  const hasUp = significant(up, down);
  const hasDown = significant(down, up);

  if (!hasUp || !hasDown) return hasDown;

  const floor = floorFacing(all, up!, down!);
  const [floorPlane, otherPlane] = floor === 1 ? [up!, down!] : [down!, up!];

  return floor !== 0 && floorPlane.height > otherPlane.height;
}
