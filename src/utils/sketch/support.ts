import * as THREE from 'three';
import { supportedSourceTransform } from './supportSource';
import type { ScenePart } from '../../types/robotics';
import { withinSupportBudget, SUPPORT_SOURCE_BYTES } from './supportBudget';
import { hashText } from '../geometryHash';
import { faceOf, referenceSketch, type Face, type FacePick } from './face';
import type { SketchPlane, Vec3 } from './placement';
import type { Sketch, SketchSupport, Vec2 } from './types';

export type SupportFailure =
  | 'malformed'
  | 'transform'
  | 'missing'
  | 'ambiguous'
  | 'topology'
  | 'solve'
  | 'profile'
  | 'cycle'
  | 'limit'
  | 'upstream';

export type ResolvedSupport =
  { status: 'ok'; face: Face; reference: Sketch } | { status: 'unresolved'; cause: SupportFailure };

export const SUPPORT_LIMITS = { depth: 16, parts: 128, geometryBytes: 16 * 1024 * 1024, sketchItems: 512 };

const EPS = 0.001;
const FAILURE_CODES = new Set([
  'malformed',
  'transform',
  'missing',
  'ambiguous',
  'topology',
  'solve',
  'profile',
  'cycle',
  'limit',
  'upstream',
]);

const validAttempt = (r: SketchSupport) =>
  (r.issue === undefined || FAILURE_CODES.has(r.issue)) &&
  (r.attempt === undefined || (typeof r.attempt === 'string' && r.attempt.length <= 200));
const vector = (value: unknown): value is Vec3 =>
  Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
const dot = (a: Vec3, b: Vec3) => a.reduce((sum, n, i) => sum + n * b[i], 0);
const axisNormal = (n: Vec3) =>
  n.filter((v) => Math.abs(v) < 1e-8).length === 2 && n.some((v) => Math.abs(Math.abs(v) - 1) < 1e-8);

function frame(value: unknown): value is SketchPlane {
  if (!value || typeof value !== 'object') return false;

  const p = value as SketchPlane;

  return (
    vector(p.origin) &&
    vector(p.n) &&
    vector(p.u) &&
    vector(p.v) &&
    axisNormal(p.n) &&
    Math.abs(dot(p.u, p.u) - 1) < 1e-8 &&
    Math.abs(dot(p.v, p.v) - 1) < 1e-8 &&
    Math.abs(dot(p.u, p.v)) < 1e-8 &&
    Math.abs(dot(p.n, p.u)) < 1e-8 &&
    Math.abs(dot(p.n, p.v)) < 1e-8
  );
}

const boundedId = (id: unknown): id is string => typeof id === 'string' && id.length > 0 && id.length <= 200;

const cornerIds = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length === 4 && new Set(value).size === 4 && value.every(boundedId);

export function validSupport(value: unknown): value is SketchSupport {
  if (!value || typeof value !== 'object') return false;

  const r = value as SketchSupport;

  return (
    r.version === 1 &&
    r.kind === 'planar-rectangle' &&
    boundedId(r.partId) &&
    vector(r.normal) &&
    axisNormal(r.normal) &&
    frame(r.frame) &&
    dot(r.frame.n, r.normal) > 1 - 1e-8 &&
    cornerIds(r.corners) &&
    boundedId(r.fingerprint) &&
    validAttempt(r)
  );
}

export const validSupportTransform = supportedSourceTransform;

const fingerprints = new WeakMap<ScenePart, string>();

export const supportGeometry = (part: ScenePart) => ({
  id: part.id,
  kind: part.kind,
  dimensions: part.dimensions,
  position: part.position,
  rotation: part.rotation,
  cad: part.cad,
  mesh: part.mesh,
  customNodes: part.customNodes,
  sculptMesh: part.sculptMesh,
  sheetTransform: part.sheetTransform,
  deformers: part.deformers,
  edges: part.edges,
  hardware: part.hardware,
});

export const supportWorkerPart = (part: ScenePart): ScenePart => ({
  ...supportGeometry(part),
  name: part.name,
  color: part.color,
  role: part.role,
  visible: true,
  locked: false,
  category: part.category,
  note: '',
  sketch: part.sketch,
});

export function supportFingerprint(part: ScenePart): string {
  const known = fingerprints.get(part);

  if (known) return known;

  const geometry = supportGeometry(part);

  if (!withinSupportBudget(geometry, SUPPORT_SOURCE_BYTES)) return 'limit';

  const text = JSON.stringify(geometry);
  const fingerprint = `${text.length}:${hashText(text)}`;

  fingerprints.set(part, fingerprint);

  return fingerprint;
}

function canonicalRectangle(face: Face): Face | null {
  if (face.edges.length !== 4 || !axisNormal(face.plane.n)) return null;

  const xs = face.edges.flatMap(([a, b]) => [a[0], b[0]]);
  const ys = face.edges.flatMap(([a, b]) => [a[1], b[1]]);
  const min: Vec2 = [Math.min(...xs), Math.min(...ys)];
  const max: Vec2 = [Math.max(...xs), Math.max(...ys)];
  const corners: Vec2[] = [
    [min[0], min[1]],
    [max[0], min[1]],
    [max[0], max[1]],
    [min[0], max[1]],
  ];
  const matches = (p: Vec2, q: Vec2) => Math.hypot(p[0] - q[0], p[1] - q[1]) < EPS;
  const edges: Array<[Vec2, Vec2]> = corners.map((p, i) => [p, corners[(i + 1) % 4]]);
  const unique = new Set<number>();

  for (const [a, b] of face.edges) {
    const index = edges.findIndex(([p, q]) => (matches(a, p) && matches(b, q)) || (matches(a, q) && matches(b, p)));

    if (index < 0 || unique.has(index)) return null;

    unique.add(index);
  }

  return max[0] - min[0] > EPS && max[1] - min[1] > EPS ? { ...face, edges } : null;
}

function uniquePlane(soup: ArrayLike<number>, normal: Vec3): boolean {
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3(...normal);
  let offset: number | undefined;

  for (let i = 0; i + 8 < soup.length; i += 9) {
    a.fromArray(soup, i);
    b.fromArray(soup, i + 3).sub(a);
    c.fromArray(soup, i + 6).sub(a);
    b.cross(c);

    if (b.lengthSq() < 1e-18 || b.normalize().dot(n) < 1 - 1e-8) continue;

    const next = a.dot(n);

    if (offset !== undefined && Math.abs(next - offset) > EPS) return false;

    offset = next;
  }

  return offset !== undefined;
}

export function resolveSupport(value: unknown, part: ScenePart, soup: ArrayLike<number>): ResolvedSupport {
  if (!validSupport(value) || value.partId !== part.id) return { status: 'unresolved', cause: 'malformed' };

  if (!validSupportTransform(part)) return { status: 'unresolved', cause: 'transform' };

  if (soup.length * 8 > SUPPORT_LIMITS.geometryBytes) return { status: 'unresolved', cause: 'limit' };

  if (!soup.length || soup.length % 9 !== 0) return { status: 'unresolved', cause: 'topology' };

  for (let i = 0; i < soup.length; i++) {
    if (!Number.isFinite(soup[i])) return { status: 'unresolved', cause: 'topology' };
  }

  if (!uniquePlane(soup, value.normal)) return { status: 'unresolved', cause: 'ambiguous' };

  const picked = faceOf(soup, { normal: value.normal });
  const face = picked && canonicalRectangle(picked);

  if (!face) return { status: 'unresolved', cause: 'topology' };

  const reference = referenceSketch(face.edges);

  return {
    status: 'ok',
    face,
    reference: {
      ...reference,
      points: reference.points.map((p, i) => ({ ...p, id: value.corners[i] })),
      entities: reference.entities.map((e) =>
        e.kind === 'line'
          ? { ...e, a: value.corners[Number(e.a.slice(1)) - 1], b: value.corners[Number(e.b.slice(1)) - 1] }
          : e,
      ),
    },
  };
}

const projectOffset = (x: number, y: number, z: number, axis: Vec3) => x * axis[0] + y * axis[1] + z * axis[2];

function pointWithinFace(face: Face, point: Vec3) {
  const { origin, u, v, n } = face.plane;
  const x = point[0] - origin[0];
  const y = point[1] - origin[1];
  const z = point[2] - origin[2];
  const projectedU = projectOffset(x, y, z, u);
  const projectedV = projectOffset(x, y, z, v);
  const min = face.edges[0][0];
  const max = face.edges[2][0];

  return (
    Math.abs(projectOffset(x, y, z, n)) <= EPS &&
    projectedU >= min[0] - EPS &&
    projectedU <= max[0] + EPS &&
    projectedV >= min[1] - EPS &&
    projectedV <= max[1] + EPS
  );
}

export function captureSupport(part: ScenePart, soup: ArrayLike<number>, pick: FacePick) {
  const direction = 'point' in pick ? pick.point : pick.normal;

  if (!vector(direction)) return null;

  if (!validSupportTransform(part) || soup.length * 8 > SUPPORT_LIMITS.geometryBytes) return null;

  const picked = faceOf(soup, pick);
  const face = picked && canonicalRectangle(picked);

  if (!face) return null;

  if ('point' in pick && !pointWithinFace(face, pick.point)) return null;

  const support: SketchSupport = {
    version: 1,
    kind: 'planar-rectangle',
    partId: part.id,
    normal: face.plane.n,
    frame: face.plane,
    corners: ['r1', 'r2', 'r3', 'r4'],
    fingerprint: supportFingerprint(part),
  };
  const resolved = resolveSupport(support, part, soup);

  return resolved.status === 'ok' ? { support, face: resolved.face, reference: resolved.reference } : null;
}
