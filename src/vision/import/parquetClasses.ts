import type { FileMetaData } from 'hyparquet';
import type { ImageClass } from '../frameSet';
import { IMAGE_LIMITS, list, name, record, refuseImage, sourceJson, type ImageSourceFiles } from './sourceFiles';

function classNames(value: unknown): string[] {
  const info = record(value);
  const features = record(info.features ?? {});
  const objects = record(features.objects ?? {});
  const feature = record(objects.feature ?? objects);
  const category = record(feature.category ?? feature.label ?? {});

  return category.names === undefined ? [] : list(category.names, 1000).map(name);
}

export function mergeParquetClasses(classes: ImageClass[], names: string[]): void {
  if (!names.length) return;

  const mismatch =
    classes.length &&
    (classes.length !== names.length || classes.some((category, i) => category.id !== i || category.name !== names[i]));

  if (mismatch) refuseImage();

  if (!classes.length) classes.push(...names.map((name, id) => ({ id, name })));
}

export async function externalParquetClasses(files: ImageSourceFiles): Promise<ImageClass[]> {
  const classes: ImageClass[] = [];

  for (const path of [...files.keys()].filter((candidate) => /(^|\/)dataset_info\.json$/.test(candidate)).sort()) {
    mergeParquetClasses(classes, classNames(await sourceJson(files, path)));
  }

  return classes;
}

function footerInfo(value: string | undefined): unknown {
  if (
    typeof value !== 'string' ||
    value.length > IMAGE_LIMITS.metadata ||
    new TextEncoder().encode(value).length > IMAGE_LIMITS.metadata
  )
    return refuseImage();

  const metadata = record(JSON.parse(value));

  return metadata.info ?? {};
}

export function embeddedParquetClasses(metadata: FileMetaData, classes: ImageClass[]): void {
  const entries = metadata.key_value_metadata ?? [];

  if (entries.length > 1000 || metadata.metadata_length > IMAGE_LIMITS.metadata) refuseImage();

  for (const entry of entries) {
    if (entry.key !== 'huggingface') continue;

    mergeParquetClasses(classes, classNames(footerInfo(entry.value)));
  }
}

export function checkParquetFooter(buffer: ArrayBuffer): void {
  if (buffer.byteLength < 12) refuseImage();

  const length = new DataView(buffer).getUint32(buffer.byteLength - 8, true);

  if (length > IMAGE_LIMITS.metadata || length > buffer.byteLength - 12) refuseImage();
}
