import type { VisionAnnotation, VisionFrame, VisionFrameSet } from './frameSet';
import {
  exportBase,
  frameSplit,
  identicalFiles,
  importBase,
  visionSplit,
  type VisionFiles,
  type VisionSplit,
} from './exportFiles';

function boxLine(annotation: VisionAnnotation, frame: VisionFrame, category: number): string {
  const [x, y, width, height] = annotation.bbox;

  return [
    category,
    (x + width / 2) / frame.width,
    (y + height / 2) / frame.height,
    width / frame.width,
    height / frame.height,
  ].join(' ');
}

const encoded = (lines: string[]) => new TextEncoder().encode(lines.length ? `${lines.join('\n')}\n` : '');

function outerContour(polygon: number[]): boolean {
  let area = 0;

  for (let i = 0; i < polygon.length; i += 2) {
    const next = (i + 2) % polygon.length;

    area += polygon[i] * polygon[next + 1] - polygon[next] * polygon[i + 1];
  }

  return area > 0;
}

function poseLine(annotation: VisionAnnotation, frame: VisionFrame, category: number, names: string[]): string {
  const points = names.flatMap((name) => {
    const point = annotation.keypoints[name];

    return point ? [point.x / frame.width, point.y / frame.height, point.visibility] : [0, 0, 0];
  });

  return `${boxLine(annotation, frame, category)} ${points.join(' ')}`;
}

function yamlLines(set: VisionFrameSet): string[] {
  return [
    'train: images/train',
    'val: images/val',
    'test: images/test',
    'names:',
    ...set.classes.map((c, i) => `  ${i}: ${JSON.stringify(c.name)}`),
  ];
}

function keypointNames(set: VisionFrameSet): string[] {
  return [
    ...new Set([
      ...set.classes.flatMap((c) => c.keypoints ?? []),
      ...set.frames.flatMap((f) => f.annotations.flatMap((a) => Object.keys(a.keypoints))),
    ]),
  ];
}

export function exportYolo(set: VisionFrameSet, split: VisionSplit = visionSplit(set)): VisionFiles {
  const files = exportBase(set, 'yolo', split);
  const classes = new Map(set.classes.map((category, index) => [category.id, index]));
  const points = keypointNames(set);

  set.frames.forEach((frame) => {
    const folder = frameSplit(frame.id, split);
    const lines = frame.annotations.map((a) => boxLine(a, frame, classes.get(a.classId)!));
    const segments = frame.annotations.flatMap((a) =>
      a.polygons
        .filter(outerContour)
        .map((polygon) =>
          [classes.get(a.classId), ...polygon.map((v, i) => v / (i % 2 ? frame.height : frame.width))].join(' '),
        ),
    );

    files[`labels/${folder}/${frame.id}.txt`] = encoded(lines);
    files[`segment/labels/${folder}/${frame.id}.txt`] = encoded(segments);
    files[`segment/images/${folder}/${frame.id}.jpg`] = frame.image;

    if (!points.length) return;

    files[`pose/images/${folder}/${frame.id}.jpg`] = frame.image;
    files[`pose/labels/${folder}/${frame.id}.txt`] = encoded(
      frame.annotations.map((a) => poseLine(a, frame, classes.get(a.classId)!, points)),
    );
  });

  files['data.yaml'] = encoded(yamlLines(set));
  files['segment/data.yaml'] = encoded(yamlLines(set));

  if (points.length)
    files['pose/data.yaml'] = encoded([
      ...yamlLines(set),
      `kpt_shape: [${points.length}, 3]`,
      'kpt_names:',
      ...set.classes.map((_, i) => `  ${i}: ${JSON.stringify(points)}`),
    ]);

  return files;
}

export function importYolo(files: VisionFiles): VisionFrameSet | null {
  const imported = importBase(files, 'yolo');

  if (!imported) return null;

  const split: VisionSplit = { order: imported.sidecar.frames.map((f) => f.id), train: [], validation: [], test: [] };

  split.train = imported.sidecar.frames.filter((f) => f.split === 'train').map((f) => f.id);
  split.validation = imported.sidecar.frames.filter((f) => f.split === 'val').map((f) => f.id);
  split.test = imported.sidecar.frames.filter((f) => f.split === 'test').map((f) => f.id);

  const expected = exportYolo(imported.set, split);
  const paths = Object.keys(expected).filter((path) => path.endsWith('.txt') || path.endsWith('.yaml'));

  return identicalFiles(files, expected, paths) ? imported.set : null;
}
