import type { DroppedFolder } from './droppedFolders';
import { importKindOf } from './importRoute';

export function modelFolderImports(files: File[], folders: DroppedFolder[]) {
  const entries = folders.flatMap((folder) => folder.files);
  const names = [...files.map((file) => file.name), ...entries.map((entry) => entry.path)];
  const robots = names.some((name) => /\.(urdf|xacro|mjcf|xml|zip)$/i.test(name));
  const models = names.some((name) => importKindOf(name, { cad: true }) === 'parts');

  if (robots || !models) return { files, folders };

  const resources = entries
    .filter((entry) => importKindOf(entry.path, { cad: true }) === 'parts' || /\.(mtl|bin)$/i.test(entry.path))
    .map((entry) => new File([entry.blob], entry.path));

  return { files: [...files, ...resources], folders: [] };
}
