import { parseCase, type Case } from '../cases/schema';
import { asId, asRecord, asString, listOf, refuse } from '../cases/validate';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { readTrained, type GalleryTrained } from './galleryTrained';

export const GALLERY_FORMAT_VERSION = 1;

export const GALLERY_BUNDLE_MAX_BYTES = 8 * 1024 * 1024;

const MAX_PARTS = 2000;
const MAX_JOINTS = 200;

export interface GalleryBundle {
  formatVersion: typeof GALLERY_FORMAT_VERSION;
  slug: string;
  title: string;
  robot: { name: string; parts: ScenePart[]; joints: RobotJoint[] };
  case: Case;
  trained?: GalleryTrained;
}

const isVec3 = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(n));

const isIndexList = (v: unknown, vertices: number) =>
  Array.isArray(v) && v.length % 3 === 0 && v.every((i) => Number.isInteger(i) && i >= 0 && i < vertices);

function readMesh(value: unknown, where: string) {
  const m = asRecord(value, where);
  const positions = m.positions;

  if (!Array.isArray(positions) || positions.length % 3 !== 0 || !positions.every((n) => Number.isFinite(n))) {
    return refuse(where, 'needs finite positions');
  }

  if (!isIndexList(m.indices, positions.length / 3) || !isVec3(m.baseSize)) return refuse(where, 'needs its triangles');
}

function readPart(value: unknown, where: string): ScenePart {
  const p = asRecord(value, where);
  const d = asRecord(p.dimensions, `${where}.dimensions`);

  asId(p.id, `${where}.id`);
  asString(p.kind, `${where}.kind`);

  if (!isVec3(p.position) || !isVec3(p.rotation)) return refuse(where, 'needs a position and rotation');

  if (![d.width, d.height, d.depth].every((n) => Number.isFinite(n))) return refuse(where, 'needs finite dimensions');

  if (p.mesh !== undefined) readMesh(p.mesh, `${where}.mesh`);

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
    ...(v.trained === undefined ? {} : { trained: readTrained(v.trained) }),
  };
}

const overBudget = (bytes: number) => bytes > GALLERY_BUNDLE_MAX_BYTES;

const OVER_BUDGET = `It’s over ${GALLERY_BUNDLE_MAX_BYTES / 1024 / 1024} MB.`;

export function galleryBundleBytes(bundle: GalleryBundle): Uint8Array {
  const bytes = new TextEncoder().encode(JSON.stringify(bundle));

  if (overBudget(bytes.byteLength)) throw new Error(OVER_BUDGET);

  return bytes;
}

export function readGalleryBundleBytes(bytes: Uint8Array): GalleryBundle {
  if (overBudget(bytes.byteLength)) return refuse('A gallery Case', OVER_BUDGET);

  let json: unknown;

  try {
    json = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return refuse('A gallery Case', 'isn’t JSON');
  }

  return parseGalleryBundle(json);
}
