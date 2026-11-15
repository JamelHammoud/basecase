import { unit } from './loads';
import { screwRegion } from './screwRegion';
import type { LightenFrozen, LightenInput } from './lightenTypes';
import type { V3 } from './types';

export function frozenRegions(input: LightenInput): LightenFrozen {
  const support = input.jobs.flatMap((job) => [...job.holds, ...job.load.screws]);

  return {
    ...input.frozen,
    planes: input.frozen?.planes?.map((plane) => ({ ...plane, halfThickness: plane.halfThickness + input.minWallMm })),
    lines: [...(input.frozen?.lines ?? []), ...support].map((line) => ({
      ...line,
      radius: line.radius + input.minWallMm,
    })),
  };
}

export function frozenQuery(regions: LightenFrozen, slack = 0): (p: V3) => boolean {
  const lines = regions.lines?.map((line) => screwRegion({ ...line, radius: line.radius + slack }, slack));
  const planes = regions.planes?.map((plane) => ({ ...plane, normal: unit(plane.normal) }));

  return (p) => {
    if (lines?.some((contains) => contains(p))) return true;

    if (
      regions.boxes?.some((box) =>
        p.every((value, axis) => value >= box.min[axis] - slack && value <= box.max[axis] + slack),
      )
    )
      return true;

    return !!planes?.some((plane) => {
      const distance = p.reduce((sum, value, axis) => sum + (value - plane.point[axis]) * plane.normal[axis], 0);

      return Math.abs(distance) <= plane.halfThickness + slack;
    });
  };
}
