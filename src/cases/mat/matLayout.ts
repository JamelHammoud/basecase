import { tagCorners, TAG_BORDER_CELLS, type FloorPoint } from '../../cameras/mat/tag36h11';
import type { ScenePart } from '../../types/robotics';
import type { Rig } from '../../utils/kinematics';
import { selectionBounds } from '../../utils/selection';
import { builderRobot } from '../caseBuilder';
import { caseSlots, type Case } from '../schema';
import { BASE_TAG_ID, placeTags, type MatContent } from './matGrid';

export { BASE_TAG_ID } from './matGrid';

export type Paper = 'a4' | 'letter';

export const PAPER_MM: Record<Paper, { width: number; height: number }> = {
  a4: { width: 210, height: 297 },
  letter: { width: 215.9, height: 279.4 },
};

export interface MatTag {
  id: number;
  center: FloorPoint;
  size: number;
}

export interface BaseTag {
  id: number;
  size: number;
  center: [number, number, number];
  up: FloorPoint;
}

export interface MatSheet {
  column: number;
  row: number;
  x0: number;
  z0: number;
  width: number;
  height: number;
}

export interface MatOutline {
  center: FloorPoint;
  width: number;
  depth: number;
  yawDeg: number;
}

export interface CaseMat {
  caseId: string;
  paper: Paper;
  sheets: MatSheet[];
  tags: MatTag[];
  base: BaseTag;
  start: { center: FloorPoint; width: number; depth: number; up: FloorPoint };
  spots: Array<{ id: string; center: FloorPoint; radius: number }>;
  path: FloorPoint[];
  outlines: MatOutline[];
}

export interface MatRobot {
  rig: Rig;
  parts: ScenePart[];
}

const LETTER_REGIONS = new Set(['US', 'CA', 'MX', 'PH', 'CL', 'CO', 'VE', 'PR', 'GT']);

export function paperFor(locale: string): Paper {
  const region = locale
    .split(/[-_]/)
    .slice(1)
    .find((part) => /^[A-Za-z]{2}$/.test(part));

  return region && LETTER_REGIONS.has(region.toUpperCase()) ? 'letter' : 'a4';
}

const BASE_FILL = 0.8;
const BASE_MIN_MM = 48;
const BASE_MAX_MM = 120;

export const isGround = (kase: Case) => caseSlots(kase)[0]?.needs.some((n) => n === 'wheels' || n === 'legs') ?? false;

function unitFloor(x: number, z: number): FloorPoint {
  const length = Math.hypot(x, z);

  return length > 1e-9 ? [x / length, z / length] : [0, 1];
}

function rootParts({ rig, parts }: MatRobot): ScenePart[] {
  const robot = rig.robots[0];
  const own = parts.filter((p) => robot?.parts.has(p.id));
  const root = own.filter((p) => !rig.ownerOf.has(p.id));

  return root.length ? root : own;
}

export function baseTagSize(topWidth: number, topDepth: number): number {
  const fitted = Math.floor((Math.min(topWidth, topDepth) * BASE_FILL) / TAG_BORDER_CELLS) * TAG_BORDER_CELLS;

  return Math.min(BASE_MAX_MM, Math.max(BASE_MIN_MM, fitted));
}

function baseTag(robot: MatRobot, up: FloorPoint, pivot: [number, number, number]): BaseTag {
  const root = rootParts(robot);

  if (!root.length) return { id: BASE_TAG_ID, size: BASE_MIN_MM, center: [...pivot], up };

  const { min, max } = selectionBounds(root);
  const size = baseTagSize(max[0] - min[0], max[2] - min[2]);

  return { id: BASE_TAG_ID, size, center: [(min[0] + max[0]) / 2, max[1], (min[2] + max[2]) / 2], up };
}

function worldContent(kase: Case): Pick<CaseMat, 'spots' | 'outlines'> {
  const objects = kase.world.objects;
  const spots = objects
    .filter((o) => o.behavior === 'marker')
    .map((o) => ({ id: o.id, center: [o.position[0], o.position[2]] as FloorPoint, radius: o.size[0] / 2 }));
  const outlines = objects
    .filter((o) => o.behavior !== 'marker')
    .map((o) => ({
      center: [o.position[0], o.position[2]] as FloorPoint,
      width: o.size[0],
      depth: o.size[2],
      yawDeg: o.rotation[1],
    }));

  return { spots, outlines };
}

export function caseMat(kase: Case, robot: MatRobot, paper: Paper): CaseMat | null {
  if (!isGround(kase)) return null;

  const builder = builderRobot(robot.rig, robot.parts);
  const up = unitFloor(builder.forward[0], builder.forward[2]);
  const pivot: FloorPoint = [builder.pivot[0], builder.pivot[2]];
  const start = { center: pivot, width: builder.footprint.width, depth: builder.footprint.depth, up };
  const { spots, outlines } = worldContent(kase);
  const path: FloorPoint[] = [pivot, ...spots.map((s) => s.center)];
  const content: MatContent = { start, spots, path, outlines };
  const { sheets, tags } = placeTags(content, PAPER_MM[paper]);

  return {
    caseId: kase.id,
    paper,
    sheets,
    tags,
    base: baseTag(robot, up, [...builder.pivot]),
    start,
    spots,
    path,
    outlines,
  };
}

export const matTagCorners = (mat: CaseMat): Array<{ id: number; corners: FloorPoint[] }> => [
  ...mat.tags.map((t) => ({ id: t.id, corners: tagCorners(t.center, t.size, [0, 1]) })),
  {
    id: mat.base.id,
    corners: tagCorners([mat.base.center[0], mat.base.center[2]], mat.base.size, mat.base.up),
  },
];
