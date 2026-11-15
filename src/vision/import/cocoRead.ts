import type { FrameSet, ImageClass, TrainingFrame } from '../frameSet';
import { decodeSourceImage } from './imageDecode';
import { annotationPixels, sourcePixels, sourcePoints } from './sourceGeometry';
import { sourceClasses } from './sourceClasses';
import {
  directory,
  imagePath,
  IMAGE_LIMITS,
  list,
  name,
  number,
  record,
  refuseImage,
  sourceBytes,
  sourceJson,
  splitOf,
  type ImageSourceFiles,
} from './sourceFiles';

export const cocoManifest = (path: string) =>
  /(^|\/)(?:[^/]*coco[^/]*|instances[^/]*|_annotations|annotations)\.json$/i.test(path);

function categoriesOf(value: unknown): ImageClass[] {
  return list(value, 1000)
    .map((entry) => {
      const category = record(entry);
      const id = number(category.id);
      const keypoints = category.keypoints === undefined ? undefined : list(category.keypoints, 256).map(name);

      if (!Number.isInteger(id) || id < 0 || id > 0xffffffff) refuseImage();

      return { id, name: name(category.name), ...(keypoints?.length ? { keypoints } : {}) };
    })
    .sort((a, b) => a.id - b.id);
}

function annotationGroups(value: unknown): Map<string, Record<string, unknown>[]> {
  const groups = new Map<string, Record<string, unknown>[]>();

  for (const entry of list(value, 1_000_000)) {
    const annotation = record(entry);
    const imageId = String(annotation.image_id);
    const group = groups.get(imageId) ?? [];

    if (group.length >= IMAGE_LIMITS.annotations) refuseImage();

    group.push(annotation);
    groups.set(imageId, group);
  }

  return groups;
}

async function readCocoManifest(
  files: ImageSourceFiles,
  path: string,
  classes: ImageClass[],
  remaining: number,
): Promise<TrainingFrame[]> {
  const metadata = await sourceJson(files, path);
  const categories = categoriesOf(metadata.categories);

  if (classes.length && JSON.stringify(classes) !== JSON.stringify(categories)) refuseImage();

  if (!classes.length) classes.push(...categories);

  const categoryIndex = sourceClasses(categories);
  const groups = annotationGroups(metadata.annotations);
  const root = directory(path);
  const parent = directory(root.replace(/\/$/, ''));
  const imageFolder = /(?:^|\/)instances_([^/]+)\.json$/i.exec(path)?.[1];
  const frames: TrainingFrame[] = [];
  const seen = new Set<string>();

  for (const value of list(metadata.images, remaining)) {
    const image = record(value);
    const imageId = String(image.id);

    if (seen.has(imageId)) refuseImage();

    seen.add(imageId);

    const file = imagePath(files, image.file_name, [
      root,
      '',
      parent,
      `${root}images/`,
      `${parent}images/`,
      ...(imageFolder ? [`${parent}${imageFolder}/`] : []),
    ]);
    const decoded = await decodeSourceImage(await sourceBytes(files, file, IMAGE_LIMITS.image), files);

    if (number(image.width) !== decoded.width || number(image.height) !== decoded.height) refuseImage();

    const annotations = (groups.get(imageId) ?? []).map((annotation, i) => {
      const category = categoryIndex.get(number(annotation.category_id)) ?? refuseImage();

      return annotationPixels({
        ...decoded,
        pixels: sourcePixels(annotation, decoded.width, decoded.height),
        instance: `instance-${i + 1}`,
        classId: category.id,
        keypoints: sourcePoints(annotation.keypoints, category.keypoints ?? [], [decoded.width, decoded.height]),
      });
    });

    frames.push({
      ...decoded,
      id: 'pending',
      camera: 'image',
      seed: 0,
      split:
        splitOf((imageFolder ?? '').replace(/(train|val|test)(?=\d{4}$)/i, '$1.')) ?? splitOf(path) ?? splitOf(file),
      annotations,
      depth: new Float32Array(decoded.width * decoded.height),
    });
  }

  if ([...groups.keys()].some((id) => !seen.has(id))) refuseImage();

  return frames;
}

export async function readCoco(files: ImageSourceFiles): Promise<Pick<FrameSet, 'classes' | 'frames'>> {
  const classes: ImageClass[] = [];
  const frames: TrainingFrame[] = [];

  for (const path of [...files.keys()].filter(cocoManifest).sort())
    frames.push(...(await readCocoManifest(files, path, classes, IMAGE_LIMITS.frames - frames.length)));

  return { classes, frames };
}
