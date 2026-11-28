import { pathDepth } from '../../electron/pathDepth.mjs';

export function pathsByDepth(paths: string[]): Array<{ path: string; depth: number }> {
  return paths
    .map((path) => ({ path, depth: pathDepth(path) }))
    .sort((a, b) => a.depth - b.depth || a.path.localeCompare(b.path));
}
