import { parquetMetadata, parquetReadObjects, parquetSchema } from 'hyparquet';
import { MB } from '../../../electron/fileSize.mjs';
import type { FrameSet, ImageClass, TrainingFrame } from '../frameSet';
import { decodeSourceImage } from './imageDecode';
import { annotationPixels, sourcePixels, sourcePoints } from './sourceGeometry';
import { sourceClasses } from './sourceClasses';
import { checkParquetFooter, embeddedParquetClasses, externalParquetClasses } from './parquetClasses';
import {
  imagePath,
  IMAGE_LIMITS,
  list,
  record,
  refuseImage,
  sourceBytes,
  splitOf,
  type ImageSourceFiles,
} from './sourceFiles';

async function rowImage(value: unknown, files: ImageSourceFiles) {
  if (value instanceof Uint8Array) return decodeSourceImage(value, files);

  const image = record(value);

  if (image.bytes instanceof Uint8Array) return decodeSourceImage(image.bytes, files);

  return decodeSourceImage(await sourceBytes(files, imagePath(files, image.path, ['']), IMAGE_LIMITS.image), files);
}

function objectsOf(value: unknown): Record<string, unknown>[] {
  const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value;

  if (Array.isArray(parsed)) return list(parsed).map(record);

  const columns = record(parsed);
  const boxes = list(columns.bbox);
  const categories = list(columns.category ?? columns.label);

  if (boxes.length !== categories.length) refuseImage();

  for (const key of ['segmentation', 'keypoints']) {
    if (columns[key] !== undefined && list(columns[key]).length !== boxes.length) refuseImage();
  }

  return boxes.map((bbox, i) => ({
    bbox,
    category: categories[i],
    segmentation: Array.isArray(columns.segmentation) ? columns.segmentation[i] : undefined,
    keypoints: Array.isArray(columns.keypoints) ? columns.keypoints[i] : undefined,
  }));
}

async function parquetFrames(
  files: ImageSourceFiles,
  path: string,
  classes: ImageClass[],
): Promise<TrainingFrame[] | null> {
  const bytes = await sourceBytes(files, path, 256 * MB);
  const buffer = Uint8Array.from(bytes).buffer;

  checkParquetFooter(buffer);

  const metadata = parquetMetadata(buffer);
  const columns = parquetSchema(metadata).children.map((column) => column.element.name);

  if (!columns.includes('objects') || !columns.includes('image')) return null;

  embeddedParquetClasses(metadata, classes);

  if (metadata.num_rows < 0 || metadata.num_rows > IMAGE_LIMITS.frames) refuseImage();

  const categoryIndex = sourceClasses(classes);
  const rows = await parquetReadObjects({ file: buffer, metadata, columns: ['image', 'objects'], utf8: false });
  const frames: TrainingFrame[] = [];

  for (const row of rows) {
    const decoded = await rowImage(row.image, files);
    const annotations = objectsOf(row.objects).map((object, i) => {
      const category = categoryIndex.inferred(object.category ?? object.label);

      return annotationPixels({
        ...decoded,
        pixels: sourcePixels(object, decoded.width, decoded.height),
        instance: `instance-${i + 1}`,
        classId: category.id,
        keypoints: sourcePoints(object.keypoints, category.keypoints ?? [], [decoded.width, decoded.height]),
      });
    });

    frames.push({
      ...decoded,
      id: 'pending',
      seed: 0,
      camera: 'image',
      split: splitOf(path),
      annotations,
      depth: new Float32Array(decoded.width * decoded.height),
    });
  }

  return frames;
}

export async function readImageParquet(files: ImageSourceFiles): Promise<Pick<FrameSet, 'classes' | 'frames'> | null> {
  const classes = await externalParquetClasses(files);
  const frames: TrainingFrame[] = [];
  let found = false;

  for (const path of [...files.keys()].filter((candidate) => /\.parquet$/i.test(candidate)).sort()) {
    const read = await parquetFrames(files, path, classes);

    if (!read) continue;

    found = true;
    frames.push(...read);

    if (frames.length > IMAGE_LIMITS.frames) refuseImage();
  }

  return found ? { classes, frames } : null;
}
