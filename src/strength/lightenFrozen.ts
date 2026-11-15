import { unit } from './loads';
import { nearLine } from './mesh';
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

export function frozenAt(regions: LightenFrozen, p: V3, slack = 0): boolean {
  if (regions.lines?.some((line) => nearLine(p, { ...line, radius: line.radius + slack }, slack))) return true;

  if (
    regions.boxes?.some((box) =>
      p.every((value, axis) => value >= box.min[axis] - slack && value <= box.max[axis] + slack),
    )
  )
    return true;

  return !!regions.planes?.some((plane) => {
    const normal = unit(plane.normal);
    const distance = p.reduce((sum, value, axis) => sum + (value - plane.point[axis]) * normal[axis], 0);

    return Math.abs(distance) <= plane.halfThickness + slack;
  });
}
