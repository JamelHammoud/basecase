import { parseCase, type Case } from '../cases/schema';
import { asId, asRecord, asString, listOf, refuse } from '../cases/validate';
import type { RobotJoint, ScenePart } from '../types/robotics';

export const GALLERY_FORMAT_VERSION = 1;

const MAX_PARTS = 2000;
const MAX_JOINTS = 200;

export interface GalleryBundle {
  formatVersion: typeof GALLERY_FORMAT_VERSION;
  slug: string;
  title: string;
  robot: { name: string; parts: ScenePart[]; joints: RobotJoint[] };
  case: Case;
}

const isVec3 = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(n));

function readPart(value: unknown, where: string): ScenePart {
  const p = asRecord(value, where);
  const d = asRecord(p.dimensions, `${where}.dimensions`);

  asId(p.id, `${where}.id`);
  asString(p.kind, `${where}.kind`);

  if (!isVec3(p.position) || !isVec3(p.rotation)) return refuse(where, 'needs a position and rotation');

  if (![d.width, d.height, d.depth].every((n) => Number.isFinite(n))) return refuse(where, 'needs finite dimensions');

  return p as unknown as ScenePart;
}

function readJoint(value: unknown, where: string): RobotJoint {
  const j = asRecord(value, where);

  asId(j.id, `${where}.id`);

  if (!isVec3(j.origin) || !isVec3(j.axis)) return refuse(where, 'needs an origin and axis');

  return j as unknown as RobotJoint;
}

export function parseGalleryBundle(input: unknown): GalleryBundle {
  const v = asRecord(input, 'A gallery Case');

  if (v.formatVersion !== GALLERY_FORMAT_VERSION) return refuse('A gallery Case', 'is from a newer Basecase');

  const robot = asRecord(v.robot, 'robot');

  return {
    formatVersion: GALLERY_FORMAT_VERSION,
    slug: asId(v.slug, 'slug'),
    title: asString(v.title, 'title'),
    robot: {
      name: asString(robot.name, 'robot.name'),
      parts: listOf(readPart, MAX_PARTS)(robot.parts, 'robot.parts'),
      joints: listOf(readJoint, MAX_JOINTS)(robot.joints, 'robot.joints'),
    },
    case: parseCase(v.case),
  };
}

export const gallerySlug = (path: string): string | null => {
  const m = /^\/c\/([\w-]{1,80})\/?$/.exec(path);

  return m ? m[1] : null;
};
