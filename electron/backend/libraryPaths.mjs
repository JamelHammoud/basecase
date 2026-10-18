import fs from 'node:fs';
import path from 'node:path';

export function libraryPaths(workspaceRoot) {
  const libraryDir = path.join(workspaceRoot, 'library');

  return {
    libraryDir,
    uploadsDir: path.join(libraryDir, 'uploads'),
    modelsDir: path.join(libraryDir, 'models'),
    scenesDir: path.join(libraryDir, 'scenes'),
    conversationsDir: path.join(libraryDir, 'conversations'),
    evidenceDir: path.join(libraryDir, 'evidence'),
    referencesDir: path.join(libraryDir, 'references'),
    aiRefDir: path.join(workspaceRoot, 'ai-reference'),
  };
}

export function ensureDirectories(paths) {
  for (const dir of [
    paths.libraryDir,
    paths.uploadsDir,
    paths.modelsDir,
    paths.scenesDir,
    paths.aiRefDir,
    paths.conversationsDir,
    paths.evidenceDir,
    paths.referencesDir,
  ]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}
