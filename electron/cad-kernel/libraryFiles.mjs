import fs from 'node:fs/promises';
import path from 'node:path';

const LIBRARY_ROOTS = [
  [path.join('vendor', 'BOSL2'), '/libraries/BOSL2'],
  [path.join('vendor', 'robotics'), '/libraries'],
];

async function readTree(dir, prefix) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      const rel = `${prefix}/${entry.name}`;

      if (entry.isDirectory()) return readTree(full, rel);

      return entry.name.endsWith('.scad') ? [[rel, await fs.readFile(full, 'utf-8')]] : [];
    }),
  );

  return nested.flat();
}

export async function readLibraryFiles(root) {
  const trees = await Promise.all(LIBRARY_ROOTS.map(([dir, prefix]) => readTree(path.join(root, dir), prefix)));

  return trees.flat();
}
