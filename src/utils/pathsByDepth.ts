export function pathsByDepth(paths: string[]): Array<{ path: string; depth: number }> {
  return paths
    .map((path) => ({ path, depth: path.split('/').length }))
    .sort((a, b) => a.depth - b.depth || a.path.localeCompare(b.path));
}
