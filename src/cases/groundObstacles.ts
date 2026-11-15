import type { V3 } from '../utils/kinematics';
import type { WorldObject } from './schema';

export interface GroundRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const STRAIGHT_ROTATION = 1e-6;
const INFLATE_STEPS = [1, 0.5, 0.25, 0];

function rectOf(o: WorldObject, inflate: number): GroundRect {
  const square = o.rotation.some((r) => Math.abs(r) > STRAIGHT_ROTATION);
  const span = Math.hypot(o.size[0], o.size[2]) / 2;
  const halfX = (square ? span : o.size[0] / 2) + inflate;
  const halfZ = (square ? span : o.size[2] / 2) + inflate;

  return {
    minX: o.position[0] - halfX,
    maxX: o.position[0] + halfX,
    minZ: o.position[2] - halfZ,
    maxZ: o.position[2] + halfZ,
  };
}

function slab(start: number, delta: number, min: number, max: number): [number, number] {
  if (Math.abs(delta) < 1e-9) return start > min && start < max ? [0, 1] : [1, 0];

  const t1 = (min - start) / delta;
  const t2 = (max - start) / delta;

  return [Math.min(t1, t2), Math.max(t1, t2)];
}

function crosses(a: V3, b: V3, r: GroundRect): boolean {
  const [x0, x1] = slab(a[0], b[0] - a[0], r.minX, r.maxX);
  const [z0, z1] = slab(a[2], b[2] - a[2], r.minZ, r.maxZ);

  return Math.max(0, x0, z0) < Math.min(1, x1, z1);
}

const inside = (p: V3, r: GroundRect) => p[0] > r.minX && p[0] < r.maxX && p[2] > r.minZ && p[2] < r.maxZ;

export function groundObstacles(objects: WorldObject[], clearanceMm: number) {
  const rectangles: GroundRect[][] = [];
  const rectangle = (index: number, level: number) => {
    const levels = (rectangles[index] ??= []);

    levels[level] ??= rectOf(objects[index], clearanceMm * INFLATE_STEPS[level]);

    return levels[level];
  };
  const outsideEnds = (a: V3, b: V3, index: number) => {
    for (let level = 0; level < INFLATE_STEPS.length; level++) {
      const rect = rectangle(index, level);

      if (!inside(a, rect) && !inside(b, rect)) return rect;
    }

    return undefined;
  };
  const blocker = (a: V3, b: V3) => {
    for (let index = 0; index < objects.length; index++) {
      const rect = outsideEnds(a, b, index);

      if (rect && crosses(a, b, rect)) return rect;
    }

    return undefined;
  };

  return { occupied: (p: V3) => objects.some((_, index) => inside(p, rectangle(index, 0))), blocker };
}
