import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mjs', '.js'];

function sourceFile(relative: string): string | null {
  const base = path.join(ROOT, relative);

  return SOURCE_EXTENSIONS.map((ext) => base + ext).find((file) => fs.existsSync(file)) ?? null;
}

export async function need<T>(relative: string, names: string[]): Promise<T> {
  const file = sourceFile(relative);

  if (!file) throw new Error(`Not built: ${relative} is missing. It must export ${names.join(', ')}.`);

  const mod = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
  const missing = names.filter((n) => mod[n] === undefined);

  if (missing.length) throw new Error(`Not built: ${relative} doesn't export ${missing.join(', ')}.`);

  return mod as T;
}

export const repoPath = (...parts: string[]) => path.join(ROOT, ...parts);
