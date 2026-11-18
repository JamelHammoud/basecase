import fs from 'node:fs/promises';
import path from 'node:path';

export function watchRouteFiles(directory, stop) {
  let pending = Promise.resolve();
  const timer = setInterval(() => {
    pending = pending.then(() => inspectRouteFiles(directory)).catch(stop);
  }, 100);

  return async () => {
    clearInterval(timer);
    await pending;
  };
}

async function inspectRouteFiles(directory) {
  const state = { root: directory, directories: [directory], bytes: 0 };
  let entries = 0;

  for (const current of state.directories) {
    const names = await routeDirectory(current, directory);

    entries += names.length;

    if (entries > 64) throw routeFileLimit('entries', entries);

    await Promise.all(names.map((name) => inspectRouteEntry(path.join(current, name), state)));
  }
}

async function inspectRouteEntry(file, state) {
  const stat = await fs.lstat(file, { throwIfNoEntry: false });

  if (!stat) return;

  if (stat.isSymbolicLink()) throw routeFileLimit('symlink', path.relative(state.root, file));

  state.bytes += stat.isFile() ? stat.size : 0;

  if (state.bytes > 24 * 1024 * 1024) throw routeFileLimit('bytes', state.bytes);

  if (stat.isDirectory()) state.directories.push(file);
}

async function routeDirectory(current, root) {
  try {
    return await fs.readdir(current);
  } catch (error) {
    if (current !== root && error.code === 'ENOENT') return [];

    throw error;
  }
}

function routeFileLimit(resource, observed) {
  return new Error('board-route-limit', { cause: { resource, observed } });
}
