export const INFO_FILE = 'meta/info.json';
export const BAG_METADATA_FILE = 'metadata.yaml';

const depthOf = (path: string) => path.split('/').length;

const isInfoFile = (path: string) => path === INFO_FILE || path.endsWith(`/${INFO_FILE}`);

const isBagMetadata = (path: string) => path === BAG_METADATA_FILE || path.endsWith(`/${BAG_METADATA_FILE}`);

export const isMcapName = (path: string) => /\.mcap$/i.test(path);

export function isLeRobotFolder(paths: string[]): string | null {
  const infos = paths.filter(isInfoFile).sort((a, b) => depthOf(a) - depthOf(b) || a.localeCompare(b));

  return infos.length ? infos[0].slice(0, -INFO_FILE.length).replace(/\/$/, '') : null;
}

export function isRosbag2Folder(paths: string[]): string | null {
  const prefixes = paths.filter(isBagMetadata).map((path) => path.slice(0, path.length - BAG_METADATA_FILE.length));

  if (prefixes.length === 0) return null;

  return prefixes.reduce((best, prefix) => (depthOf(prefix) < depthOf(best) ? prefix : best));
}

export function sourceKind(paths: string[]): 'lerobot' | 'rosbag2' | 'mcap' | null {
  if (isLeRobotFolder(paths) !== null) return 'lerobot';

  if (isRosbag2Folder(paths) !== null) return 'rosbag2';

  return paths.length && paths.every(isMcapName) ? 'mcap' : null;
}
