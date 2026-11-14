import type { VisionAnnotation, VisionClass, VisionFrameSet } from './frameSet';
import {
  exportBase,
  fileText,
  frameSplit,
  identicalFiles,
  importBase,
  jsonBytes,
  SPLITS,
  visionSplit,
  type VisionFiles,
  type VisionSplit,
} from './exportFiles';

function pointNames(set: VisionFrameSet, category: VisionClass): string[] {
  return [
    ...new Set([
      ...(category.keypoints ?? []),
      ...set.frames.flatMap((frame) =>
        frame.annotations.filter((a) => a.classId === category.id).flatMap((a) => Object.keys(a.keypoints)),
      ),
    ]),
  ];
}

function annotationOf(annotation: VisionAnnotation, imageId: number, index: number, names: string[]) {
  const keypoints = names.flatMap((name) => {
    const point = annotation.keypoints[name];

    return point ? [point.x, point.y, point.visibility] : [0, 0, 0];
  });

  return {
    id: index + 1,
    image_id: imageId,
    category_id: annotation.classId,
    bbox: annotation.bbox,
    segmentation: annotation.mask,
    area: annotation.mask.counts.reduce((total, length, i) => total + (i % 2 ? length : 0), 0),
    iscrowd: 0,
    keypoints,
    num_keypoints: keypoints.filter((v, i) => i % 3 === 2 && v > 0).length,
  };
}

export function exportCoco(set: VisionFrameSet, split: VisionSplit = visionSplit(set)): VisionFiles {
  const files = exportBase(set, 'coco', split);
  const names = new Map(set.classes.map((c) => [c.id, pointNames(set, c)]));
  const imageIds = new Map(set.frames.map((frame, i) => [frame.id, i + 1]));
  const annotationIds = new Map(
    set.frames.flatMap((frame) => frame.annotations.map((a) => `${frame.id}:${a.id}`)).map((key, i) => [key, i]),
  );
  const categories = set.classes.map((c) => ({
    id: c.id,
    name: c.name,
    supercategory: c.kind,
    keypoints: names.get(c.id),
    skeleton: [],
  }));

  SPLITS.forEach((folder) => {
    const ids = split.order.filter((id) => frameSplit(id, split) === folder);
    const frames = ids.map((id) => set.frames.find((frame) => frame.id === id)!);
    const images = frames.map((frame) => ({
      id: imageIds.get(frame.id),
      basecase_id: frame.id,
      file_name: `images/${folder}/${frame.id}.jpg`,
      width: frame.width,
      height: frame.height,
    }));
    const annotations = frames.flatMap((frame) =>
      frame.annotations.map((a) =>
        annotationOf(a, imageIds.get(frame.id)!, annotationIds.get(`${frame.id}:${a.id}`)!, names.get(a.classId) ?? []),
      ),
    );

    files[`annotations/instances_${folder}.json`] = jsonBytes({ images, annotations, categories });
  });

  return files;
}

export function importCoco(files: VisionFiles): VisionFrameSet | null {
  const imported = importBase(files, 'coco');

  if (!imported) return null;

  try {
    const split: VisionSplit = { order: [], train: [], validation: [], test: [] };

    SPLITS.forEach((folder) => {
      const native = JSON.parse(fileText(files[`annotations/instances_${folder}.json`]));
      const ids = native.images.map((image: { basecase_id: string }) => image.basecase_id);

      split.order.push(...ids);

      if (folder === 'train') split.train = ids;

      if (folder === 'val') split.validation = ids;

      if (folder === 'test') split.test = ids;
    });

    const expected = exportCoco(imported.set, split);
    const paths = SPLITS.map((folder) => `annotations/instances_${folder}.json`);

    return identicalFiles(files, expected, paths) ? imported.set : null;
  } catch {
    return null;
  }
}
