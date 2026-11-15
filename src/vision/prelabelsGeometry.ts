import type { ImageAnnotation, ImageClass, TrainingFrame } from './frameSet';
import { labelGeometry } from './labelEdits';
import { boxPixels } from './import/sourceGeometry';
import type { VisionDetection, VisionResult } from './types';

export interface PrelabelFrameInput {
  frame: Pick<TrainingFrame, 'width' | 'height' | 'annotations'>;
  classes: ImageClass[];
  result: VisionResult;
}

function detectionPixels(detection: VisionDetection, width: number, height: number): Uint8Array {
  if (!detection.mask) {
    const [x, y, w, h] = detection.box;

    return boxPixels([x * width, y * height, w * width, h * height], width, height);
  }

  const mask = detection.mask;

  if (
    !Number.isInteger(mask.width) ||
    !Number.isInteger(mask.height) ||
    mask.width < 1 ||
    mask.height < 1 ||
    mask.width > 2048 ||
    mask.height > 2048 ||
    mask.values.length !== mask.width * mask.height
  )
    throw new Error('The model returned an unsupported mask.');

  const pixels = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    const sourceY = Math.min(mask.height - 1, Math.floor(((y + 0.5) * mask.height) / height));

    for (let x = 0; x < width; x++) {
      const sourceX = Math.min(mask.width - 1, Math.floor(((x + 0.5) * mask.width) / width));

      pixels[y * width + x] = mask.values[sourceY * mask.width + sourceX] ? 1 : 0;
    }
  }

  return pixels;
}

const classKey = (name: string) => name.trim().toLowerCase();

function categoryFor(classes: ImageClass[], label: string): ImageClass {
  const existing = classes.find((category) => classKey(category.name) === classKey(label));

  if (existing) return existing;

  if (!label.trim() || label.length > 200 || classes.length >= 1000) throw new Error('Keep up to 1000 named classes.');

  const id = Math.max(-1, ...classes.map((category) => category.id)) + 1;

  if (id > 0xffffffff) throw new Error('Choose a class id below 4294967295.');

  const category = { id, name: label.trim() };

  classes.push(category);

  return category;
}

function withKeypointNames(category: ImageClass, count: number): ImageClass {
  if (!count || (category.keypoints?.length ?? 0) >= count) return category;

  if (count > 256) throw new Error('Keep up to 256 named keypoints.');

  const names = [...(category.keypoints ?? [])];
  let index = 1;

  while (names.length < count) {
    const name = `point_${index++}`;

    if (!names.includes(name)) names.push(name);
  }

  return { ...category, keypoints: names };
}

function annotationFor(options: {
  input: PrelabelFrameInput;
  detection: VisionDetection;
  category: ImageClass;
  instance: string;
  pixels: Uint8Array;
}): ImageAnnotation {
  const { input, detection, category, instance, pixels } = options;
  const { width, height } = input.frame;
  const keypoints = (detection.keypoints ?? []).map(([u, v], index) => {
    if (!Number.isFinite(u) || !Number.isFinite(v)) throw new Error('The model returned unsupported keypoints.');

    return {
      name: category.keypoints![index],
      x: u * width,
      y: v * height,
      visible: u >= 0 && u < 1 && v >= 0 && v < 1,
    };
  });

  return {
    ...labelGeometry({ width, height, instance, classId: category.id, pixels, keypoints }),
    source: 'model',
    review: 'suggested',
  };
}

export function prelabelFrameLabels(input: PrelabelFrameInput) {
  const { frame, result } = input;

  if (result.width !== frame.width || result.height !== frame.height)
    throw new Error('The model frame dimensions changed.');

  const classes = [...input.classes];
  const annotations = frame.annotations.filter(
    (annotation) => annotation.source !== 'model' || annotation.review !== 'suggested',
  );
  const instances = new Set(annotations.map((annotation) => annotation.instance));
  let next = 0;

  for (const detection of result.detections) {
    const pixels = detectionPixels(detection, frame.width, frame.height);

    if (!pixels.some(Boolean)) continue;

    const category = withKeypointNames(categoryFor(classes, detection.label), detection.keypoints?.length ?? 0);

    classes[classes.findIndex((entry) => entry.id === category.id)] = category;

    while (instances.has(`model_${next}`)) next++;

    const instance = `model_${next++}`;

    instances.add(instance);
    annotations.push(annotationFor({ input, detection, category, instance, pixels }));
  }

  return { classes, annotations };
}
