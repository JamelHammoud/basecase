import type { FrameSet, ImageClass, ImageKeypoint, TrainingFrame } from '../frameSet';
import { decodeSourceImage } from './imageDecode';
import { annotationPixels, boxPixels, polygonPixels } from './sourceGeometry';
import { IMAGE_LIMITS, number, refuseImage, sourceBytes, sourceText, type ImageSourceFiles } from './sourceFiles';
import { readYoloYaml, type YoloDescription } from './yoloYaml';
import { yoloImages, yoloLabels } from './yoloFiles';

interface YoloContext {
  width: number;
  height: number;
  description: YoloDescription;
  classes: ImageClass[];
}

function yoloPixels(cells: number[], context: YoloContext): Uint8Array {
  const { width, height, description } = context;
  const shape = description.keypointShape;
  const segment = description.task === 'segment' || (!shape && cells.length > 4);

  if (segment && (cells.length < 6 || cells.length % 2 || cells.some((v) => v > 1))) refuseImage();

  if (segment) return polygonPixels([cells.map((v, i) => v * (i % 2 ? height : width))], width, height);

  if (
    (!shape && cells.length !== 4) ||
    (shape && cells.length !== 4 + shape[0] * shape[1]) ||
    cells.slice(0, 4).some((v) => v > 1)
  )
    refuseImage();

  const [cx, cy, w, h] = cells;

  return boxPixels([(cx - w / 2) * width, (cy - h / 2) * height, w * width, h * height], width, height);
}

function yoloPoints(cells: number[], context: YoloContext, category: ImageClass) {
  const { width, height, description } = context;
  const shape = description.keypointShape;

  if (!shape) return [];

  const points: ImageKeypoint[] = [];

  for (let i = 0; i < shape[0]; i++) {
    const at = 4 + i * shape[1];
    const x = cells[at];
    const y = cells[at + 1];
    const visibility = shape[1] === 3 ? cells[at + 2] : 2;

    if (x >= 1 || y >= 1 || (visibility !== 0 && visibility !== 1 && visibility !== 2)) refuseImage();

    if (visibility === 0) continue;

    points.push({ name: category.keypoints![i], x: x * width, y: y * height, visible: visibility === 2 });
  }

  return points;
}

function yoloAnnotation(line: string, context: YoloContext, index: number) {
  const tokens = line.trim().split(/\s+/);
  const classId = number(Number(tokens[0]));
  const cells = new Array<number>(tokens.length - 1);

  for (let i = 1; i < tokens.length; i++) cells[i - 1] = number(Number(tokens[i]));

  const category = context.classes[classId] ?? refuseImage();

  if (cells.length > IMAGE_LIMITS.points || cells.some((v) => v < 0) || !Number.isInteger(classId)) refuseImage();

  return annotationPixels({
    pixels: yoloPixels(cells, context),
    width: context.width,
    height: context.height,
    instance: `instance-${index + 1}`,
    classId: category.id,
    keypoints: yoloPoints(cells, context, category),
  });
}

export async function readYolo(files: ImageSourceFiles): Promise<Pick<FrameSet, 'classes' | 'frames'>> {
  const yaml =
    [...files.keys()].filter((path) => /(^|\/)(data|dataset)\.ya?ml$/i.test(path)).sort()[0] ?? refuseImage();
  const description = readYoloYaml(await sourceText(files, yaml));
  const classes = description.names.map((name, id) => ({
    id,
    name,
    ...(description.keypointShape
      ? { keypoints: Array.from({ length: description.keypointShape[0] }, (_, i) => `point-${i + 1}`) }
      : {}),
  }));
  const paths = await yoloImages(files, yaml, description);

  if (paths.length > IMAGE_LIMITS.frames) refuseImage();

  const frames: TrainingFrame[] = [];

  for (const { path, split } of paths) {
    const decoded = await decodeSourceImage(await sourceBytes(files, path, IMAGE_LIMITS.image), files);
    const candidates = yoloLabels(path);
    const label = candidates.find((candidate) => files.has(candidate));
    const rows = label ? (await sourceText(files, label)).split(/\r?\n/).filter((row) => row.trim()) : [];

    if (rows.length > IMAGE_LIMITS.annotations) refuseImage();

    const annotations = rows.map((row, i) => yoloAnnotation(row, { ...decoded, description, classes }, i));

    frames.push({
      ...decoded,
      id: 'pending',
      seed: 0,
      camera: 'image',
      split,
      annotations,
      depth: new Float32Array(decoded.width * decoded.height),
    });
  }

  return { classes, frames };
}
