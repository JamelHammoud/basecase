import { MAX_WORLD_BYTES } from '../cases/worldImport/limits';
import { importWorldInWorker } from '../cases/worldImportClient';
import { CaseFileError } from '../cases/validate';
import { fileSize } from '../../electron/fileSize.mjs';

const WORLD_FILE = /\.(?:glb|gltf|obj|spz|ply|json)$/i;

export const hasWorldFile = (files: readonly Pick<File, 'name'>[]) => files.some((file) => WORLD_FILE.test(file.name));

export async function readDroppedWorld(files: File[]) {
  if (files.length > 256 || files.reduce((sum, file) => sum + file.size, 0) > MAX_WORLD_BYTES)
    throw new CaseFileError(`World is over ${fileSize(MAX_WORLD_BYTES)}`);

  const bytes = await Promise.all(
    files.map(async (file) => ({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) })),
  );

  return importWorldInWorker({ files: bytes });
}
