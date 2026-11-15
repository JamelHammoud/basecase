import type { LocalFile } from '../utils/robotImport';
import { zipEntryNames } from '../utils/robotImport/zipDirectory';
import type { ImportSource } from '../datasets/import/readSource';
import { sourceKind } from '../datasets/import/sourceKind';
import type { RobotSource } from './useRobotInsert';

const isZip = (path: string) => /\.zip$/i.test(path);

const zipNames = (blob: Blob) => zipEntryNames(blob).catch(() => []);

const commonFolder = (files: LocalFile[]) => {
  const roots = new Set(files.map((file) => (file.path.includes('/') ? file.path.split('/')[0] : '')));

  return roots.size === 1 ? [...roots][0] : '';
};

async function zipSource(name: string, file: LocalFile): Promise<ImportSource | null> {
  const kind = sourceKind(await zipNames(file.blob));

  return kind ? { kind: 'zip', name, blob: file.blob } : null;
}

export async function dataSourceOf(source: RobotSource): Promise<ImportSource | null> {
  if (source.kind !== 'files' || !source.files.length) return null;

  const name = commonFolder(source.files) || source.name || source.files[0].path;
  const [only] = source.files;

  if (source.files.length === 1 && isZip(only.path)) return zipSource(name, only);

  const kind = sourceKind(source.files.map((f) => f.path));

  return kind ? { kind: 'files', name, files: source.files.map(({ path, blob }) => ({ path, blob })) } : null;
}
