import type { Dataset, ImageMembers } from '../datasets/datasetFile';
import { exportCoco } from './cocoExport';
import { frameHash, frameSetHash, type FrameSet, type ImageClass, type TrainingFrame } from './frameSet';
import { exportYolo } from './yoloExport';

const imageDatasetCard = new TextEncoder().encode(
  [
    '---',
    'tags:',
    '  - basecase-image-dataset',
    'task_categories:',
    '  - object-detection',
    '  - image-segmentation',
    '---',
    '# Basecase image dataset',
    '',
    'Training images and labels in [COCO](coco/) and [YOLO](yolo/) format.',
    '',
    'Each layout includes `basecase/frames.json` for Basecase labels and image splits.',
    'Depth files use little-endian float32 radial distances in millimeters.',
    '',
  ].join('\n'),
);

function mergedClasses(sets: FrameSet[]): ImageClass[] {
  const categories = new Map<string, ImageClass>();

  for (const set of sets) {
    for (const category of set.classes) {
      const existing = categories.get(category.name);
      const keypoints = [...new Set([...(existing?.keypoints ?? []), ...(category.keypoints ?? [])])];

      categories.set(category.name, {
        id: existing?.id ?? categories.size,
        name: category.name,
        ...(category.objectId ? { objectId: category.objectId } : {}),
        ...(keypoints.length ? { keypoints } : {}),
      });
    }
  }

  return [...categories.values()];
}

async function selectedFrames(member: ImageMembers, set: FrameSet, classes: ImageClass[]) {
  if ((await frameSetHash(set)) !== member.hash) throw new Error('The image dataset content changed.');

  const frames = new Map(set.frames.map((frame) => [frame.id, frame]));
  const names = new Map(set.classes.map((category) => [category.id, category.name]));
  const categoryIds = new Map(classes.map((category) => [category.name, category.id]));
  const selected: TrainingFrame[] = [];

  for (const id of member.frameIds) {
    const original = frames.get(id);

    if (!original) throw new Error('The dataset is missing an image.');

    const frame = {
      ...original,
      annotations: original.annotations.map((annotation) => ({
        ...annotation,
        classId: categoryIds.get(names.get(annotation.classId)!)!,
      })),
    };
    const hash = await frameHash(frame);

    selected.push({ ...frame, id: hash });
  }

  return selected;
}

export async function buildImageDataset(dataset: Dataset, sets: FrameSet[]) {
  const classes = mergedClasses(sets);
  const byId = new Map(sets.map((set) => [set.id, set]));
  const frames = new Map<string, TrainingFrame>();

  for (const member of dataset.imageMembers ?? []) {
    const set = byId.get(member.frameSetId);

    if (!set) throw new Error('The dataset is missing its images.');

    for (const frame of await selectedFrames(member, set, classes)) frames.set(frame.id, frame);
  }

  const set: FrameSet = {
    version: 1,
    id: dataset.id,
    name: dataset.name,
    caseId: dataset.caseId,
    sceneId: dataset.sceneId,
    seed: dataset.seed,
    classes,
    frames: [...frames.values()],
    createdAt: dataset.createdAt,
  };
  const prefix = (folder: string, files: Record<string, Uint8Array>) =>
    Object.fromEntries(Object.entries(files).map(([path, bytes]) => [`${folder}/${path}`, bytes]));

  return {
    ...prefix('coco', exportCoco(set)),
    ...prefix('yolo', exportYolo(set)),
    'README.md': imageDatasetCard.slice(),
  };
}
