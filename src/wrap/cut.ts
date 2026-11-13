import type { Solid } from './manifold';
import { BASE_LINK, type V3, type WrapJoint } from './wrapTypes';
import { centerOf, dot, length, scale, soupBounds, sub, unit, type Bounds } from './vec';

const ALONG_AXIS = Math.SQRT1_2;
const SAME_POINT_MM = 1e-3;

export interface Plane {
  normal: V3;
  offset: number;
}

function linkLine(joint: Pick<WrapJoint, 'origin' | 'axis'>, from: V3, to: V3): V3 {
  if (length(sub(to, from)) > SAME_POINT_MM) return unit(sub(to, from));

  return length(sub(to, joint.origin)) > SAME_POINT_MM ? unit(sub(to, joint.origin)) : unit(joint.axis);
}

export function cutPlane(joint: Pick<WrapJoint, 'origin' | 'axis'>, from: V3, to: V3): Plane {
  const axis = unit(joint.axis);
  const line = linkLine(joint, from, to);
  const along = dot(line, axis);
  const normal = Math.abs(along) >= ALONG_AXIS ? scale(axis, Math.sign(along)) : unit(sub(line, scale(axis, along)));

  return { normal, offset: dot(normal, joint.origin) };
}

export function linkCenters(joints: WrapJoint[], bounds: Map<string, Bounds>): Map<string, V3> {
  const centers = new Map<string, V3>();
  const links = [BASE_LINK, ...joints.map((j) => j.id)];
  const childJoints = (link: string) => joints.filter((j) => j.parentLink === link);

  for (const link of links) {
    const box = bounds.get(link);
    const below = childJoints(link).map((j) => j.origin);
    const own = joints.find((j) => j.id === link)?.origin;
    const fallback = below.length ? centerOf(soupBounds([Float32Array.from(below.flat())])!) : own;

    if (box) centers.set(link, centerOf(box));
    else if (fallback) centers.set(link, fallback);
  }

  return centers;
}

function swap(old: Solid, next: Solid): Solid {
  if (next !== old) old.delete();

  return next;
}

function bisect(region: Solid, joint: WrapJoint, sibling: WrapJoint): Solid {
  const apart = sub(joint.origin, sibling.origin);

  if (length(apart) < SAME_POINT_MM) return region;

  const normal = unit(apart);
  const middle = scale([...joint.origin].map((v, i) => v + sibling.origin[i]) as V3, 0.5);

  return region.trimByPlane(normal, dot(normal, middle));
}

export function linkRegions(shell: Solid, joints: WrapJoint[], centers: Map<string, V3>): Map<string, Solid> {
  const regions = new Map<string, Solid>([[BASE_LINK, shell]]);

  for (const joint of joints) {
    const parent = regions.get(joint.parentLink);
    const from = centers.get(joint.parentLink) ?? joint.origin;
    const to = centers.get(joint.id) ?? joint.origin;

    if (!parent) continue;

    const plane = cutPlane(joint, from, to);
    const siblings = joints.filter((k) => k !== joint && k.parentLink === joint.parentLink);
    const child = siblings.reduce(
      (region, k) => swap(region, bisect(region, joint, k)),
      parent.trimByPlane(plane.normal, plane.offset),
    );

    regions.set(joint.id, child);
    regions.set(joint.parentLink, swap(parent, parent.subtract(child)));
  }

  return regions;
}
