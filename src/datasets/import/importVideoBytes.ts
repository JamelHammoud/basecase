import type { BuiltTries } from './importedTries';
import { readBytes, safePath } from './lerobotSource';
import type { SourceFile } from './types';

export async function importVideoBytes(built: BuiltTries, files: SourceFile[]): Promise<BuiltTries> {
  const byPath = new Map(files.map((file) => [file.path, file]));
  const bytes = new Map<string, Uint8Array>();

  for (const entry of built.kept) {
    entry.videos = [];

    for (const video of entry.stored.videos ?? []) {
      const path = safePath(video.path);

      if (!byPath.has(path)) continue;

      const loaded = bytes.get(path) ?? (await readBytes(byPath, path));

      bytes.set(path, loaded);
      entry.videos.push({ camera: video.camera, bytes: loaded });
    }
  }

  return built;
}
