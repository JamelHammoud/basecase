import { canonicalJson, isHash, sha256Hex } from '../skills/hash';
import { hashFrame, hashFrameSet, type FrameSetManifest, type VisionFrame, type VisionFrameSet } from './frameSet';

type Raw = Record<string, unknown>;

const object = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 2000;
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const numbers = (v: unknown): v is number[] =>
  Array.isArray(v) && v.every((n) => typeof n === 'number' && Number.isFinite(n));
const vector = (v: unknown) => numbers(v) && v.length === 3;
const unique = (values: unknown[]) => new Set(values).size === values.length;

function validLens(v: unknown): boolean {
  if (!object(v)) return false;

  return (
    (v.model === 'pinhole' && typeof v.hfovDeg === 'number' && v.hfovDeg > 0 && v.hfovDeg < 180) ||
    (v.model === 'fisheye' && typeof v.fovDeg === 'number' && v.fovDeg > 0 && v.fovDeg <= 360)
  );
}

function validCamera(v: unknown): boolean {
  return (
    object(v) &&
    text(v.key) &&
    text(v.label) &&
    validLens(v.lens) &&
    vector(v.position) &&
    vector(v.target) &&
    vector(v.up)
  );
}

function validClass(v: unknown): boolean {
  if (!object(v) || !count(v.id) || !text(v.name) || !text(v.kind)) return false;

  return v.keypoints === undefined || (Array.isArray(v.keypoints) && v.keypoints.every(text) && unique(v.keypoints));
}

function validPoint(v: unknown): boolean {
  return (
    object(v) &&
    typeof v.x === 'number' &&
    Number.isFinite(v.x) &&
    typeof v.y === 'number' &&
    Number.isFinite(v.y) &&
    (v.visibility === 0 || v.visibility === 1 || v.visibility === 2)
  );
}

function validMask(v: unknown, frame: VisionFrame): boolean {
  return (
    object(v) &&
    numbers(v.size) &&
    v.size.length === 2 &&
    v.size[0] === frame.height &&
    v.size[1] === frame.width &&
    Array.isArray(v.counts) &&
    v.counts.length > 0 &&
    v.counts.every(count) &&
    v.counts.reduce((a, b) => a + b, 0) === frame.width * frame.height
  );
}

function validBox(v: unknown, frame: VisionFrame): boolean {
  return (
    numbers(v) &&
    v.length === 4 &&
    v[0] >= 0 &&
    v[1] >= 0 &&
    v[2] > 0 &&
    v[3] > 0 &&
    v[0] + v[2] <= frame.width &&
    v[1] + v[3] <= frame.height
  );
}

function validAnnotation(v: unknown, frame: VisionFrame, classIds: Set<number>): boolean {
  return (
    object(v) &&
    text(v.id) &&
    text(v.partId) &&
    count(v.classId) &&
    classIds.has(v.classId) &&
    validBox(v.bbox, frame) &&
    validMask(v.mask, frame) &&
    Array.isArray(v.polygons) &&
    v.polygons.every((p) => numbers(p) && p.length >= 6 && p.length % 2 === 0) &&
    object(v.keypoints) &&
    Object.values(v.keypoints).every(validPoint)
  );
}

function validFrameData(v: Raw): boolean {
  return (
    count(v.width) &&
    count(v.height) &&
    v.width > 0 &&
    v.height > 0 &&
    v.width <= 8192 &&
    v.height <= 8192 &&
    v.image instanceof Uint8Array &&
    v.image.length > 0 &&
    v.depth instanceof Float32Array &&
    v.depth.length === v.width * v.height &&
    v.depth.every((d) => Number.isFinite(d) && d >= 0)
  );
}

export function validFrame(v: unknown, classIds?: Set<number>): v is VisionFrame {
  if (!object(v) || !isHash(v.id) || !count(v.seed) || !validFrameData(v) || !validCamera(v.camera)) return false;

  if (!Array.isArray(v.annotations)) return false;

  const ids = classIds ?? new Set<number>(v.annotations.map((a) => a.classId));

  if (!v.annotations.every((a) => validAnnotation(a, v as unknown as VisionFrame, ids))) return false;

  return unique(v.annotations.map((a) => a.id)) && hashFrame(v as unknown as VisionFrame) === v.id;
}

export function validManifest(value: unknown): value is FrameSetManifest {
  if (!object(value) || value.format !== 'basecase-vision' || value.version !== 1 || !isHash(value.id)) return false;

  if (!text(value.name) || !text(value.caseId) || !count(value.seed)) return false;

  if (!Array.isArray(value.classes) || !value.classes.every(validClass) || !unique(value.classes.map((c) => c.id)))
    return false;

  if (!Array.isArray(value.frames) || !value.frames.every(isHash) || !unique(value.frames)) return false;

  const { id, ...content } = value;

  return sha256Hex(canonicalJson(content)) === id;
}

export function validFrameSet(value: unknown): value is VisionFrameSet {
  if (!object(value) || value.format !== 'basecase-vision' || value.version !== 1 || !isHash(value.id)) return false;

  if (!text(value.name) || !text(value.caseId) || !count(value.seed)) return false;

  if (!Array.isArray(value.classes) || !value.classes.every(validClass) || !unique(value.classes.map((c) => c.id)))
    return false;

  const classIds = new Set<number>(value.classes.map((c) => c.id));

  if (
    !Array.isArray(value.frames) ||
    !value.frames.every((f) => validFrame(f, classIds)) ||
    !unique(value.frames.map((f) => f.id))
  )
    return false;

  return hashFrameSet(value as unknown as VisionFrameSet) === value.id;
}
