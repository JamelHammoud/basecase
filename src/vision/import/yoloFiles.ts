import type { TrainingFrame } from '../frameSet';
import {
  directory,
  IMAGE_LIMITS,
  refuseImage,
  safeImagePath,
  sourceText,
  splitOf,
  type ImageSourceFiles,
} from './sourceFiles';
import type { YoloDescription } from './yoloYaml';

const isImage = (path: string) => /\.(jpg|jpeg|png)$/i.test(path);

function relativePath(base: string, reference: string): string | null {
  if (reference.length > 1000) return refuseImage();

  safeImagePath(
    reference
      .split('/')
      .map((segment) => (['.', '..'].includes(segment) ? 'relative' : segment))
      .join('/'),
  );

  const segments = base.split('/').filter(Boolean);

  for (const segment of reference.split('/')) {
    if (segment === '.') continue;

    if (segment === '..' && !segments.length) return null;

    if (segment === '..') segments.pop();
    else segments.push(segment);
  }

  return segments.length ? safeImagePath(segments.join('/')) : '';
}

function pathExists(files: ImageSourceFiles, path: string): boolean {
  return !path || files.has(path) || [...files.keys()].some((file) => file.startsWith(`${path}/`));
}

function splitPath(files: ImageSourceFiles, base: string, reference: string): string {
  const path = relativePath(base, reference);

  if (path !== null && (pathExists(files, path) || !reference.startsWith('../'))) return path;

  if (!reference.startsWith('../')) return refuseImage();

  const fallback = relativePath(base, reference.slice(3));

  return fallback !== null && pathExists(files, fallback) ? fallback : refuseImage();
}

async function selectedImages(files: ImageSourceFiles, path: string): Promise<string[]> {
  if (isImage(path)) return files.has(path) ? [path] : refuseImage();

  if (!/\.txt$/i.test(path)) return [...files.keys()].filter((file) => file.startsWith(`${path}/`) && isImage(file));

  const lines = (await sourceText(files, path))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length > IMAGE_LIMITS.frames) refuseImage();

  return lines.map((line) => {
    const file = relativePath(directory(path), line) ?? refuseImage();

    return isImage(file) && files.has(file) ? file : refuseImage();
  });
}

export async function yoloImages(files: ImageSourceFiles, yaml: string, description: YoloDescription) {
  const root = directory(yaml);
  const base = relativePath(root, description.paths.path ?? '.') ?? refuseImage();
  const splits = ['train', 'val', 'test'].filter((key) => description.paths[key]);
  const selected = new Map<string, { path: string; split: TrainingFrame['split'] }>();

  if (!splits.length)
    return [...files.keys()]
      .filter((path) => (!base || path.startsWith(`${base}/`)) && isImage(path))
      .sort()
      .map((path) => ({ path, split: splitOf(path) }));

  for (const split of splits) {
    const path = splitPath(files, base, description.paths[split]);
    const images = path ? await selectedImages(files, path) : [...files.keys()].filter(isImage);

    for (const image of images) selected.set(`${split}/${image}`, { path: image, split: splitOf(split) });

    if (selected.size > IMAGE_LIMITS.frames) refuseImage();
  }

  return [...selected.values()].sort((a, b) => a.path.localeCompare(b.path) || a.split!.localeCompare(b.split!));
}

export function yoloLabels(path: string): string[] {
  const at = `/${path}`.lastIndexOf('/images/');
  const labels = at < 0 ? path : `${path.slice(0, at)}labels/${path.slice(at + 'images/'.length)}`;

  return [labels.replace(/\.[^.]+$/, '.txt'), path.replace(/\.[^.]+$/, '.txt')];
}
