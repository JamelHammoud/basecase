import type { ManifoldApi, Solid } from '../wrap/manifold';
import { unit } from './loads';
import type { LightenFrozen, LightenPlane } from './lightenTypes';
import type { ScrewLine, V3 } from './types';

function lineSolid(api: ManifoldApi, line: ScrewLine): Solid {
  const delta = line.to.map((value, axis) => value - line.from[axis]) as V3;
  const direction = unit(delta);
  const length = Math.hypot(...delta);
  const radius = line.radius / Math.cos(Math.PI / 64);
  const cylinder = api.Manifold.cylinder(length + radius * 2, radius, radius, 64);
  const turn = cylinder.rotate([
    0,
    (Math.acos(direction[2]) * 180) / Math.PI,
    (Math.atan2(direction[1], direction[0]) * 180) / Math.PI,
  ]);
  const moved = turn.translate(line.from.map((value, axis) => value - direction[axis] * radius) as V3);

  cylinder.delete();
  turn.delete();

  return moved;
}

function planeSolid(original: Solid, plane: LightenPlane): Solid {
  const normal = unit(plane.normal);
  const offset = plane.point.reduce((sum, value, axis) => sum + value * normal[axis], 0);
  const lower = original.trimByPlane(normal, offset - plane.halfThickness);
  const slab = lower.trimByPlane(normal.map((value) => -value) as V3, -offset - plane.halfThickness);

  lower.delete();

  return slab;
}

export function frozenSolid(api: ManifoldApi, original: Solid, regions: LightenFrozen): Solid {
  const shapes: Solid[] = [];

  for (const box of regions.boxes ?? []) {
    const cube = api.Manifold.cube(box.max.map((value, axis) => value - box.min[axis]) as V3);
    const moved = cube.translate(box.min);

    shapes.push(moved);
    cube.delete();
  }

  shapes.push(...(regions.lines ?? []).map((line) => lineSolid(api, line)));
  shapes.push(...(regions.planes ?? []).map((plane) => planeSolid(original, plane)));

  const joined = api.Manifold.union(shapes);
  const exact = original.intersect(joined);

  shapes.forEach((shape) => shape.delete());
  joined.delete();

  return exact;
}
