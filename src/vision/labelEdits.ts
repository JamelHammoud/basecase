import type { FrameSet, ImageAnnotation, ImageKeypoint, TrainingFrame } from './frameSet';
import { canonicalPolygonPixels } from './labelEditsPolygons';
import { annotationPixels, boxPixels, polygonPixels } from './import/sourceGeometry';

export interface LabelGeometry {
  width: number;
  height: number;
  instance: string;
  classId: number;
  pixels?: Uint8Array;
  preserveHoles?: boolean;
  box?: ImageAnnotation['box'];
  polygons?: number[][];
  keypoints?: ImageKeypoint[];
}

function geometryPixels(input: LabelGeometry): Uint8Array {
  if (input.polygons && input.preserveHoles) return canonicalPolygonPixels(input.polygons, input.width, input.height);

  if (input.polygons) return polygonPixels(input.polygons, input.width, input.height);

  return boxPixels(input.box, input.width, input.height);
}

export function labelGeometry(input: LabelGeometry): ImageAnnotation {
  const pixels = input.pixels ?? geometryPixels(input);

  return { ...annotationPixels({ ...input, pixels }), source: 'manual', review: 'accepted' };
}

function editFrame(set: FrameSet, frameId: string, edit: (frame: TrainingFrame) => TrainingFrame): FrameSet {
  if (!set.frames.some((frame) => frame.id === frameId)) throw new Error('Choose a frame.');

  return { ...set, frames: set.frames.map((frame) => (frame.id === frameId ? edit(frame) : frame)) };
}

export function putLabel(set: FrameSet, frameId: string, annotation: ImageAnnotation): FrameSet {
  if (!set.classes.some((category) => category.id === annotation.classId)) throw new Error('Choose a class.');

  return editFrame(set, frameId, (frame) => ({
    ...frame,
    annotations: [...frame.annotations.filter((label) => label.instance !== annotation.instance), annotation],
  }));
}

export function deleteLabel(set: FrameSet, frameId: string, instance: string): FrameSet {
  return editFrame(set, frameId, (frame) => ({
    ...frame,
    annotations: frame.annotations.filter((label) => label.instance !== instance),
  }));
}

function checkedName(set: FrameSet, name: string, classId?: number): string {
  const trimmed = name.trim();

  if (
    !trimmed ||
    trimmed.length > 200 ||
    set.classes.some((category) => category.id !== classId && category.name === trimmed)
  )
    throw new Error('Choose a unique class name with 1 to 200 characters.');

  return trimmed;
}

export function addLabelClass(set: FrameSet, name: string): FrameSet {
  if (set.classes.length >= 1000) throw new Error('Keep up to 1000 classes.');

  let categoryId = 0;

  while (set.classes.some((entry) => entry.id === categoryId)) categoryId++;

  const category = { id: categoryId, name: checkedName(set, name) };

  return { ...set, classes: [...set.classes, category] };
}

export function renameLabelClass(set: FrameSet, classId: number, name: string): FrameSet {
  const trimmed = checkedName(set, name, classId);

  if (!set.classes.some((category) => category.id === classId)) throw new Error('Choose a class.');

  if (set.classes.find((category) => category.id === classId)?.name === trimmed) return set;

  return {
    ...set,
    classes: set.classes.map((category) => (category.id === classId ? { ...category, name: trimmed } : category)),
  };
}

export interface LabelKeypointEdit {
  frameId: string;
  instance: string;
  point: ImageKeypoint;
}

function checkedKeypoint(point: ImageKeypoint, frame: TrainingFrame): ImageKeypoint {
  const named = { ...point, name: point.name.trim() };

  if (
    !named.name ||
    named.name.length > 200 ||
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    point.x < 0 ||
    point.y < 0 ||
    point.x >= frame.width ||
    point.y >= frame.height
  )
    throw new Error('Place the named keypoint inside the frame.');

  return named;
}

function keypointNames(names: string[], name: string): string[] {
  if (names.length >= 256 && !names.includes(name)) throw new Error('Keep up to 256 named keypoints per class.');

  return [...new Set([...names, name])];
}

export function setLabelKeypoint(set: FrameSet, input: LabelKeypointEdit): FrameSet {
  const frame = set.frames.find((entry) => entry.id === input.frameId);
  const annotation = frame?.annotations.find((entry) => entry.instance === input.instance);

  if (!frame || !annotation) throw new Error('Choose a label.');

  const point = checkedKeypoint(input.point, frame);
  const classes = set.classes.map((category) =>
    category.id === annotation.classId
      ? { ...category, keypoints: keypointNames(category.keypoints ?? [], point.name) }
      : category,
  );
  const changed = {
    ...annotation,
    keypoints: [...annotation.keypoints.filter((entry) => entry.name !== point.name), point],
    source: 'manual' as const,
    review: 'accepted' as const,
  };

  return putLabel({ ...set, classes }, frame.id, changed);
}

export function acceptLabels(set: FrameSet, frameId: string, instance?: string): FrameSet {
  const frame = set.frames.find((entry) => entry.id === frameId);

  if (!frame?.annotations.some((label) => label.review === 'suggested' && (!instance || label.instance === instance)))
    return set;

  return editFrame(set, frameId, (frame) => ({
    ...frame,
    annotations: frame.annotations.map((label) =>
      label.review === 'suggested' && (!instance || label.instance === instance)
        ? { ...label, review: 'accepted' }
        : label,
    ),
  }));
}

export interface LabelHistory {
  past: FrameSet[];
  present: FrameSet;
  future: FrameSet[];
}

export const createLabelHistory = (present: FrameSet): LabelHistory => ({ past: [], present, future: [] });

export function commitLabels(history: LabelHistory, present: FrameSet): LabelHistory {
  if (history.present === present) return history;

  return { past: [...history.past, history.present], present, future: [] };
}

export function undoLabels(history: LabelHistory): LabelHistory {
  const present = history.past.at(-1);

  if (!present) return history;

  return { past: history.past.slice(0, -1), present, future: [history.present, ...history.future] };
}

export function redoLabels(history: LabelHistory): LabelHistory {
  const present = history.future[0];

  if (!present) return history;

  return { past: [...history.past, history.present], present, future: history.future.slice(1) };
}
