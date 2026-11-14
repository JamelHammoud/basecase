import type { FrameSet, ImageAnnotation, ImageClass, TrainingFrame } from './frameSet';
import { jsonBytes } from './imageBytes';
import { imagePackage, readImagePackage, verifyImageFiles, type ImageFiles } from './imagePackage';
import { imageSplit, IMAGE_SPLITS, splitFolder } from './imageSplit';

function cocoAnnotation(annotation: ImageAnnotation, category: ImageClass, frame: TrainingFrame) {
  const points = new Map(annotation.keypoints.map((p) => [p.name, p]));
  const keypoints = (category.keypoints ?? []).flatMap((name) => {
    const point = points.get(name);

    if (!point || point.x < 0 || point.x >= frame.width || point.y < 0 || point.y >= frame.height) return [0, 0, 0];

    return [point.x, point.y, point.visible ? 2 : 1];
  });

  return {
    category_id: annotation.classId,
    bbox: annotation.box,
    segmentation: annotation.mask,
    area: annotation.mask.counts.reduce((sum, count, i) => sum + (i % 2 ? count : 0), 0),
    iscrowd: 0,
    keypoints,
    num_keypoints: keypoints.filter((v, i) => i % 3 === 2 && v > 0).length,
  };
}

export function exportCoco(set: FrameSet): ImageFiles {
  const files = imagePackage(set);
  const split = imageSplit(set);
  const frames = new Map(set.frames.map((frame) => [frame.id, frame]));
  const classes = new Map(set.classes.map((category) => [category.id, category]));

  for (const name of IMAGE_SPLITS) {
    const chosen = split[name].map((id) => frames.get(id)!);
    let annotationId = 0;
    const images = chosen.map((frame, index) => ({
      id: index + 1,
      file_name: `images/${splitFolder(name)}/${frame.id}.jpg`,
      width: frame.width,
      height: frame.height,
    }));
    const annotations = chosen.flatMap((frame, index) =>
      frame.annotations.map((annotation) => ({
        id: ++annotationId,
        image_id: index + 1,
        ...cocoAnnotation(annotation, classes.get(annotation.classId)!, frame),
      })),
    );

    files[`annotations/instances_${name}.json`] = jsonBytes({
      info: { description: set.name, version: '1' },
      images,
      annotations,
      categories: set.classes.map((c) => ({
        id: c.id,
        name: c.name,
        supercategory: '',
        keypoints: c.keypoints ?? [],
        skeleton: [],
      })),
    });
  }

  return files;
}

export function importCoco(files: ImageFiles): FrameSet {
  const set = readImagePackage(files);

  verifyImageFiles(exportCoco(set), files);

  return set;
}
