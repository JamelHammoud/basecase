import type { Dataset, ImageMembers } from '../datasets/datasetFile';
import { exportCoco } from './cocoExport';
import { frameHash, frameSetHash, type FrameSet, type ImageClass, type TrainingFrame } from './frameSet';
import { exportYolo } from './yoloExport';
import type { FrozenImageSample } from '../datasets/snapshotImages';
import type { ImageSplit } from './imageSplit';

function mergedClasses(sets: FrameSet[]): ImageClass[] {
  const categories = new Map<string, ImageClass>();

  for (const set of sets) {
    for (const category of set.classes) {
      const existing = categories.get(category.name);
      const keypoints = [...new Set([...(existing?.keypoints ?? []), ...(category.keypoints ?? [])])];

      categories.set(category.name, {
        id: existing?.id ?? categories.size,
        name: category.name,
        ...(keypoints.length ? { keypoints } : {}),
      });
    }
  }

  return [...categories.values()];
}

function frameIndex(set: FrameSet, classes: ImageClass[]) {
  const frames = new Map(set.frames.map((frame) => [frame.id, frame]));
  const categoryIds = new Map(classes.map((category) => [category.name, category.id]));
  const remapped = new Map(set.classes.map((category) => [category.id, categoryIds.get(category.name)!]));

  return { frames, remapped };
}

type FrameIndex = ReturnType<typeof frameIndex>;

async function remapFrame(original: TrainingFrame, classes: FrameIndex['remapped']) {
  const frame = {
    ...original,
    annotations: original.annotations.map((annotation) => ({
      ...annotation,
      classId: classes.get(annotation.classId)!,
    })),
  };
  const hash = await frameHash(frame);

  return { ...frame, id: hash };
}

async function remapFrames(index: FrameIndex, ids: string[]) {
  const selected: TrainingFrame[] = [];

  for (const id of ids) {
    const original = index.frames.get(id);

    if (!original) throw new Error('The dataset is missing an image.');

    selected.push(await remapFrame(original, index.remapped));
  }

  return selected;
}

async function selectedFrames(member: ImageMembers, set: FrameSet, classes: ImageClass[]) {
  if ((await frameSetHash(set)) !== member.hash) throw new Error('The image dataset content changed.');

  return remapFrames(frameIndex(set, classes), member.frameIds);
}

async function frozenFrames(samples: FrozenImageSample[], sets: FrameSet[], classes: ImageClass[]) {
  const byId = new Map(sets.map((set) => [set.id, frameIndex(set, classes)]));
  const frames = new Map<string, TrainingFrame>();
  const splits: Record<string, ImageSplit> = {};

  for (const sample of samples) {
    const index = byId.get(sample.frameSetId);
    const original = index?.frames.get(sample.frameId);

    if (!index || !original) throw new Error('The dataset is missing a frozen image.');

    if ((await frameHash(original)) !== sample.hash) throw new Error('The frozen image content changed.');

    const frame = await remapFrame(original, index.remapped);

    if (splits[frame.id] && splits[frame.id] !== sample.split)
      throw new Error('The dataset assigns the same image to different splits.');

    frames.set(frame.id, frame);
    splits[frame.id] = sample.split;
  }

  return { frames: [...frames.values()], splits };
}

async function memberFrames(dataset: Dataset, sets: FrameSet[], classes: ImageClass[]) {
  const byId = new Map(sets.map((set) => [set.id, set]));
  const frames = new Map<string, TrainingFrame>();

  for (const member of dataset.imageMembers ?? []) {
    const set = byId.get(member.frameSetId);

    if (!set) throw new Error('The dataset is missing its images.');

    for (const frame of await selectedFrames(member, set, classes)) frames.set(frame.id, frame);
  }

  return { frames: [...frames.values()] };
}

export async function buildImageDataset(dataset: Dataset, sets: FrameSet[], samples?: FrozenImageSample[]) {
  const classes = mergedClasses(sets);
  const selected = samples ? await frozenFrames(samples, sets, classes) : await memberFrames(dataset, sets, classes);
  const set: FrameSet = {
    version: 1,
    id: dataset.id,
    name: dataset.name,
    caseId: dataset.caseId,
    sceneId: dataset.sceneId,
    seed: dataset.seed,
    classes,
    ...selected,
    createdAt: dataset.createdAt,
  };
  const prefix = (folder: string, files: Record<string, Uint8Array>) =>
    Object.fromEntries(Object.entries(files).map(([path, bytes]) => [`${folder}/${path}`, bytes]));

  return { ...prefix('coco', exportCoco(set)), ...prefix('yolo', exportYolo(set)) };
}
