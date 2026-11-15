import type { SourceFile, SourceFolder } from '../../datasets/import/types';
import { DataImportError } from '../../datasets/import/types';
import { isRecord } from '../../datasets/import/lerobotSource';
import type { TrainingFrame } from '../frameSet';

export type ImageSourceFiles = Map<string, SourceFile>;
export const IMAGE_LIMITS = {
  files: 20_000,
  frames: 10_000,
  annotations: 10_000,
  points: 100_000,
  metadata: 16_000_000,
  image: 64_000_000,
  pixels: 16_777_216,
  totalPixels: 64_000_000,
  totalBytes: 600_000_000,
};
export const refuseImage = (): never => {
  throw new DataImportError('Check the image dataset format.');
};
export const record = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : refuseImage());
export const list = (value: unknown, limit = IMAGE_LIMITS.annotations): unknown[] =>
  Array.isArray(value) && value.length <= limit ? value : refuseImage();
export const number = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : refuseImage();
export const name = (value: unknown): string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 200 ? value : refuseImage();
export const directory = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf('/') + 1));
export const splitOf = (path: string): TrainingFrame['split'] => {
  const split = path
    .toLowerCase()
    .split(/[/_.-]/)
    .find((part) => ['train', 'val', 'valid', 'validation', 'test'].includes(part));

  if (split === 'train' || split === 'test') return split;

  return split ? 'validation' : undefined;
};

export function safeImagePath(path: string): string {
  if (
    !path ||
    path.length > 1000 ||
    /[\\:?#%]/.test(path) ||
    [...path].some((c) => c.charCodeAt(0) < 32) ||
    path.startsWith('/') ||
    path.split('/').some((p) => p === '..' || !p)
  )
    refuseImage();

  return path;
}

const pixelBudgets = new WeakMap<ImageSourceFiles, number>();

export function chargeImage(files: ImageSourceFiles, width: number, height: number): void {
  const pixels = (pixelBudgets.get(files) ?? 0) + width * height;

  if (!Number.isSafeInteger(pixels) || pixels > IMAGE_LIMITS.totalPixels)
    throw new DataImportError('The image dataset exceeds its size limit.');

  pixelBudgets.set(files, pixels);
}

export function sourceFiles(folder: SourceFolder): ImageSourceFiles {
  if (
    folder.files.length > IMAGE_LIMITS.files ||
    folder.files.reduce((sum, file) => sum + file.size, 0) > IMAGE_LIMITS.totalBytes
  )
    refuseImage();

  const files = new Map<string, SourceFile>();

  for (const file of folder.files) {
    safeImagePath(file.path);

    if (files.has(file.path) || !Number.isSafeInteger(file.size) || Math.sign(file.size) === -1) refuseImage();

    files.set(file.path, file);
  }

  return files;
}

export async function sourceBytes(
  files: ImageSourceFiles,
  path: string,
  limit = IMAGE_LIMITS.metadata,
): Promise<Uint8Array> {
  const file = files.get(safeImagePath(path)) ?? refuseImage();

  if (file.size > limit) throw new DataImportError('The image dataset exceeds its size limit.');

  const bytes = await file.read();

  if (bytes.length > limit) throw new DataImportError('The image dataset exceeds its size limit.');

  if (bytes.length !== file.size) refuseImage();

  return bytes;
}

export const sourceText = async (files: ImageSourceFiles, path: string) =>
  new TextDecoder('utf-8', { fatal: true }).decode(await sourceBytes(files, path));
export const sourceJson = async (files: ImageSourceFiles, path: string) =>
  record(JSON.parse(await sourceText(files, path)));

export function imagePath(files: ImageSourceFiles, reference: unknown, roots: string[]): string {
  const path = safeImagePath(name(reference));
  const candidates = [...new Set(roots.map((root) => `${root}${path}`))].filter((candidate) => files.has(candidate));

  return candidates[0] ?? refuseImage();
}
