import type { LocalFile } from '../utils/robotImport';
import { zipEntryNames } from '../utils/robotImport/zipDirectory';
import type { ImportSource } from '../datasets/import/readSource';
import type { RobotSource } from './useRobotInsert';

const isZip = (path: string) => /\.zip$/i.test(path);

const zipNames = (blob: Blob) => zipEntryNames(blob).catch(() => []);

const sourceKindOf = async (paths: string[]) => (await import('../datasets/import/readSource')).sourceKind(paths);

async function zipSource(name: string, file: LocalFile): Promise<ImportSource | null> {
  const kind = await sourceKindOf(await zipNames(file.blob));

  return kind ? { kind: 'zip', name, blob: file.blob } : null;
}

export async function dataSourceOf(source: RobotSource): Promise<ImportSource | null> {
  if (source.kind !== 'files' || !source.files.length) return null;

  const name = source.name ?? source.files[0].path;
  const [only] = source.files;

  if (source.files.length === 1 && isZip(only.path)) return zipSource(name, only);

  const kind = await sourceKindOf(source.files.map((f) => f.path));

  return kind ? { kind: 'files', name, files: source.files.map(({ path, blob }) => ({ path, blob })) } : null;
}
