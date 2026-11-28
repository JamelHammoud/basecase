import { unit } from './loads';
import { screwRegion } from './screwRegion';
import type { LightenBox, LightenFrozen, LightenInput, LightenPlane } from './lightenTypes';
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

function boxContains(box: LightenBox, p: V3, slack: number): boolean {
  return (
    p[0] >= box.min[0] - slack &&
    p[0] <= box.max[0] + slack &&
    p[1] >= box.min[1] - slack &&
    p[1] <= box.max[1] + slack &&
    p[2] >= box.min[2] - slack &&
    p[2] <= box.max[2] + slack
  );
}

function planeContains(plane: LightenPlane, p: V3, slack: number): boolean {
  const distance =
    0 +
    (p[0] - plane.point[0]) * plane.normal[0] +
    (p[1] - plane.point[1]) * plane.normal[1] +
    (p[2] - plane.point[2]) * plane.normal[2];

  return Math.abs(distance) <= plane.halfThickness + slack;
}

export function frozenQuery(regions: LightenFrozen, slack = 0): (p: V3) => boolean {
  const lines = regions.lines?.map((line) => screwRegion({ ...line, radius: line.radius + slack }, slack)) ?? [];
  const planes = regions.planes?.map((plane) => ({ ...plane, normal: unit(plane.normal) })) ?? [];
  const noBoxes: LightenBox[] = [];

  return (p) => {
    for (const contains of lines) {
      if (contains(p)) return true;
    }

    for (const box of regions.boxes ?? noBoxes) {
      if (boxContains(box, p, slack)) return true;
    }

    for (const plane of planes) {
      if (planeContains(plane, p, slack)) return true;
    }

    return false;
  };
}
