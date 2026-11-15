import { decodeMask, maskBox, maskPolygons } from './imageMasks';
import { sha256 } from '../cases/tries';
import { depthBytes } from './imageBytes';
import type { ImageSplit } from './imageSplit';

export interface ImageClass {
  id: number;
  name: string;
  keypoints?: string[];
}

export interface ImageKeypoint {
  name: string;
  x: number;
  y: number;
  visible: boolean;
}

export interface ImageMask {
  size: [number, number];
  counts: number[];
}

export interface ImageAnnotation {
  instance: string;
  classId: number;
  box: [number, number, number, number];
  mask: ImageMask;
  polygons: number[][];
  keypoints: ImageKeypoint[];
}

export interface TrainingFrame {
  id: string;
  seed: number;
  camera: string;
  width: number;
  height: number;
  jpeg: Uint8Array;
  annotations: ImageAnnotation[];
  depth: Float32Array;
}

export interface FrameSet {
  version: 1;
  id: string;
  name: string;
  caseId: string | null;
  sceneId: string | null;
  seed: number;
  classes: ImageClass[];
  frames: TrainingFrame[];
  createdAt: string;
  splits?: Record<string, ImageSplit>;
}

const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const id = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,128}$/.test(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 200;
const uint = (v: unknown): v is number => Number.isInteger(v) && Number(v) >= 0 && Number(v) <= 0xffffffff;
const unique = (values: unknown[]) => new Set(values).size === values.length;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const refuse = () => {
  throw new Error('Check the image dataset format.');
};

function validClass(value: unknown): value is ImageClass {
  if (!object(value) || !uint(value.id) || !text(value.name)) return false;

  if (value.keypoints === undefined) return true;

  return (
    Array.isArray(value.keypoints) &&
    value.keypoints.length <= 256 &&
    value.keypoints.every(text) &&
    unique(value.keypoints)
  );
}

function validPoint(value: unknown, frame: TrainingFrame, names: string[]): boolean {
  return (
    object(value) &&
    typeof value.name === 'string' &&
    names.includes(value.name) &&
    finite(value.x) &&
    finite(value.y) &&
    typeof value.visible === 'boolean' &&
    (!value.visible || (value.x >= 0 && value.x < frame.width && value.y >= 0 && value.y < frame.height))
  );
}

function annotationFields(value: unknown): boolean {
  return (
    object(value) &&
    typeof value.instance === 'string' &&
    value.instance.length > 0 &&
    value.instance.length <= 256 &&
    object(value.mask) &&
    Array.isArray(value.mask.size) &&
    Array.isArray(value.mask.counts) &&
    Array.isArray(value.keypoints) &&
    Array.isArray(value.polygons)
  );
}

function validateAnnotation(value: unknown, frame: TrainingFrame, classes: ImageClass[]): void {
  if (!annotationFields(value)) refuse();

  const annotation = value as unknown as ImageAnnotation;
  const category = classes.find((c) => c.id === annotation.classId);

  if (
    !category ||
    !same(annotation.mask.size, [frame.height, frame.width]) ||
    !annotation.keypoints.every((p) => validPoint(p, frame, category.keypoints ?? [])) ||
    !unique(annotation.keypoints.map((p) => p.name))
  )
    refuse();

  const pixels = decodeMask(annotation.mask);
  const box = maskBox(pixels, frame.width, frame.height);

  if (!box || !same(box, annotation.box) || !same(maskPolygons(pixels, frame.width, frame.height), annotation.polygons))
    refuse();
}

function frameDimensions(value: Record<string, unknown>): boolean {
  return (
    uint(value.width) &&
    uint(value.height) &&
    value.width >= 1 &&
    value.height >= 1 &&
    value.width <= 8192 &&
    value.height <= 8192 &&
    value.width * value.height <= 16_777_216
  );
}

function frameFields(value: unknown): boolean {
  return object(value) && id(value.id) && uint(value.seed) && text(value.camera) && frameDimensions(value);
}

export function validateTrainingFrameHeader(value: unknown): asserts value is Omit<TrainingFrame, 'jpeg' | 'depth'> {
  if (!frameFields(value)) refuse();

  const frame = value as Omit<TrainingFrame, 'jpeg' | 'depth'>;

  if (!Array.isArray(frame.annotations) || frame.annotations.length > 10_000) refuse();
}

export function validateTrainingFrame(value: unknown, classes: ImageClass[]): asserts value is TrainingFrame {
  validateTrainingFrameHeader(value);

  const frame = value as unknown as TrainingFrame;

  if (
    !(frame.jpeg instanceof Uint8Array) ||
    frame.jpeg.length < 4 ||
    frame.jpeg.length > 64_000_000 ||
    !(frame.depth instanceof Float32Array) ||
    frame.depth.length !== frame.width * frame.height
  )
    refuse();

  if (
    frame.jpeg[0] !== 255 ||
    frame.jpeg[1] !== 216 ||
    frame.jpeg.at(-2) !== 255 ||
    frame.jpeg.at(-1) !== 217 ||
    !frame.depth.every((v) => finite(v) && v >= 0) ||
    !unique(frame.annotations.map((a) => a?.instance))
  )
    refuse();

  frame.annotations.forEach((a) => validateAnnotation(a, frame, classes));
}

function setFields(value: unknown): boolean {
  return (
    object(value) &&
    value.version === 1 &&
    id(value.id) &&
    text(value.name) &&
    uint(value.seed) &&
    text(value.createdAt) &&
    (value.caseId === null || id(value.caseId)) &&
    (value.sceneId === null || id(value.sceneId))
  );
}

export function validateFrameSetHeader(value: unknown): asserts value is Omit<FrameSet, 'frames'> {
  if (!setFields(value)) refuse();

  const header = value as Omit<FrameSet, 'frames'>;

  if (
    !Array.isArray(header.classes) ||
    header.classes.length > 1000 ||
    !header.classes.every(validClass) ||
    !unique(header.classes.map((c) => c.id)) ||
    !unique(header.classes.map((c) => c.name))
  )
    refuse();
}

export function validateFrameSet(value: unknown): asserts value is FrameSet {
  validateFrameSetHeader(value);

  const set = value as FrameSet;

  if (!Array.isArray(set.frames) || set.frames.length > 100_000 || !unique(set.frames.map((f) => f?.id))) refuse();

  if (
    set.splits !== undefined &&
    (!object(set.splits) ||
      Object.keys(set.splits).length !== set.frames.length ||
      !set.frames.every((frame) => ['train', 'validation', 'test'].includes(set.splits?.[frame.id] ?? '')))
  )
    refuse();

  set.frames.forEach((f) => validateTrainingFrame(f, set.classes));
}

async function byteHash(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes));

  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function frameHash(frame: Omit<TrainingFrame, 'id'> | TrainingFrame): Promise<string> {
  const annotations = frame.annotations.map((annotation) => ({
    instance: annotation.instance,
    classId: annotation.classId,
    box: annotation.box,
    mask: { size: annotation.mask.size, counts: annotation.mask.counts },
    polygons: annotation.polygons,
    keypoints: annotation.keypoints.map((p) => ({ name: p.name, x: p.x, y: p.y, visible: p.visible })),
  }));

  return sha256(
    JSON.stringify({
      seed: frame.seed,
      camera: frame.camera,
      width: frame.width,
      height: frame.height,
      annotations,
      jpeg: await byteHash(frame.jpeg),
      depth: await byteHash(depthBytes(frame.depth)),
    }),
  );
}

export async function frameSetManifestHash(set: Omit<FrameSet, 'frames'>, frames: string[]): Promise<string> {
  validateFrameSetHeader(set);

  if (frames.length > 100_000 || !frames.every((hash) => /^[a-f0-9]{64}$/.test(hash))) refuse();

  return sha256(
    JSON.stringify({
      caseId: set.caseId,
      sceneId: set.sceneId,
      seed: set.seed,
      classes: set.classes.map((category) => ({ id: category.id, name: category.name, keypoints: category.keypoints })),
      frames,
    }),
  );
}

export async function frameSetHash(set: FrameSet): Promise<string> {
  validateFrameSet(set);

  const hashes: string[] = [];

  for (const frame of set.frames) hashes.push(await frameHash(frame));

  return frameSetManifestHash(set, hashes);
}
