import type { ImageAnnotation, ImageClass } from '../vision/frameSet';
import { checkedFrameId } from '../vision/frameSetStoreTypes';
import type { LabelGeometry } from '../vision/labelEdits';

export interface FrameLabels {
  frame: string;
  annotations: Array<Omit<LabelGeometry, 'width' | 'height'> & Partial<Pick<ImageAnnotation, 'mask'>>>;
}

export interface LabelFramesInput {
  frameSet: string;
  frames?: string[];
  labels?: FrameLabels[];
  classes?: ImageClass[];
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const unique = (values: unknown[]) => new Set(values).size === values.length;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const refuse = () => {
  throw new Error('Check the frame labels.');
};

function checkedList(value: unknown, limit: number): unknown[] {
  if (!Array.isArray(value) || !value.length || value.length > limit) return refuse();

  return value;
}

function validBox(value: unknown): boolean {
  return Array.isArray(value) && value.length === 4 && value.every(finite) && value[2] > 0 && value[3] > 0;
}

function validRing(value: unknown): boolean {
  return (
    Array.isArray(value) && value.length >= 6 && value.length <= 10000 && value.length % 2 === 0 && value.every(finite)
  );
}

function validPolygons(value: unknown): boolean {
  return Array.isArray(value) && value.length <= 1000 && value.every(validRing);
}

function validPoint(value: unknown): boolean {
  return (
    record(value) &&
    typeof value.name === 'string' &&
    value.name.trim().length > 0 &&
    value.name.length <= 200 &&
    finite(value.x) &&
    finite(value.y) &&
    typeof value.visible === 'boolean'
  );
}

function validPoints(value: unknown): boolean {
  return Array.isArray(value) && value.length <= 256 && value.every(validPoint);
}

function validMask(value: Record<string, unknown>): boolean {
  return (
    record(value.mask) &&
    Array.isArray(value.mask.size) &&
    Array.isArray(value.mask.counts) &&
    Array.isArray(value.polygons) &&
    Array.isArray(value.keypoints)
  );
}

function validIdentity(value: Record<string, unknown>): boolean {
  return (
    typeof value.instance === 'string' &&
    value.instance.trim().length > 0 &&
    value.instance.length <= 256 &&
    Number.isInteger(value.classId) &&
    Number(value.classId) >= 0
  );
}

function annotationInput(value: unknown): FrameLabels['annotations'][number] {
  if (!record(value) || !validIdentity(value)) return refuse();

  if (value.box !== undefined && !validBox(value.box)) return refuse();

  if (value.polygons !== undefined && !validPolygons(value.polygons)) return refuse();

  if (value.mask !== undefined && !validMask(value)) return refuse();

  if (value.mask === undefined && value.box === undefined && value.polygons === undefined) return refuse();

  if (value.keypoints !== undefined && !validPoints(value.keypoints)) return refuse();

  const { instance, classId, box, polygons, mask, keypoints } = value as unknown as FrameLabels['annotations'][number];

  return { instance, classId, box, polygons, mask, keypoints };
}

function frameLabels(value: unknown): FrameLabels {
  if (!record(value) || !Array.isArray(value.annotations) || value.annotations.length > 1000) return refuse();

  const frame = checkedFrameId(value.frame as string);
  const annotations = value.annotations.map(annotationInput);

  if (!unique(annotations.map((annotation) => annotation.instance))) return refuse();

  return { frame, annotations };
}

export function labelFramesInput(payload: Record<string, unknown>): LabelFramesInput {
  if (new TextEncoder().encode(JSON.stringify(payload)).length > 16 * 1024 * 1024)
    throw new Error('Keep the frame labels under 16 MB.');

  const frameSet = checkedFrameId(payload.frame_set as string);
  const frames =
    payload.frames === undefined ? undefined : checkedList(payload.frames, 8).map((id) => checkedFrameId(id as string));
  const labels = payload.labels === undefined ? undefined : checkedList(payload.labels, 8).map(frameLabels);

  if ((frames && !unique(frames)) || (labels && !unique(labels.map((label) => label.frame)))) return refuse();

  if (payload.classes !== undefined && (!Array.isArray(payload.classes) || payload.classes.length > 1000))
    return refuse();

  return { frameSet, frames, labels, classes: payload.classes as ImageClass[] | undefined };
}
