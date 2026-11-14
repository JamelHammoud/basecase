import type { FrameSet, TrainingFrame } from './frameSet';
import { imagePackage, readImagePackage, verifyImageFiles, type ImageFiles } from './imagePackage';
import { imageSplit, IMAGE_SPLITS, splitFolder } from './imageSplit';

function detectionLabels(frame: TrainingFrame, classes: Map<number, number>): Uint8Array {
  const rows = frame.annotations.map((annotation) => {
    const [x, y, width, height] = annotation.box;

    return [
      classes.get(annotation.classId),
      (x + width / 2) / frame.width,
      (y + height / 2) / frame.height,
      width / frame.width,
      height / frame.height,
    ].join(' ');
  });

  return new TextEncoder().encode(rows.length ? `${rows.join('\n')}\n` : '');
}

export function exportYolo(set: FrameSet): ImageFiles {
  const files = imagePackage(set);
  const split = imageSplit(set);
  const frames = new Map(set.frames.map((frame) => [frame.id, frame]));
  const categories = [...set.classes].sort((a, b) => a.id - b.id);
  const classes = new Map(categories.map((category, index) => [category.id, index]));

  for (const name of IMAGE_SPLITS) {
    for (const id of split[name]) {
      const frame = frames.get(id)!;

      files[`labels/${splitFolder(name)}/${id}.txt`] = detectionLabels(frame, classes);
    }
  }

  const yaml = [
    'path: .',
    'train: images/train',
    'val: images/val',
    'test: images/test',
    `names: ${JSON.stringify(categories.map((c) => c.name))}`,
    '',
  ];

  files['data.yaml'] = new TextEncoder().encode(yaml.join('\n'));

  return files;
}

export function importYolo(files: ImageFiles): FrameSet {
  const set = readImagePackage(files);

  verifyImageFiles(exportYolo(set), files);

  return set;
}
