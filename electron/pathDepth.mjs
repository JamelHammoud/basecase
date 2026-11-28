export function pathDepth(path) {
  let depth = 1;

  for (let at = path.indexOf('/'); at !== -1; at = path.indexOf('/', at + 1)) depth++;

  return depth;
}
