import { imageSourceKind, type ImageSourceKind } from '../../vision/import/imageSourceKind';
import { pathsByDepth } from '../../utils/pathsByDepth';

export const INFO_FILE = 'meta/info.json';
export const BAG_METADATA_FILE = 'metadata.yaml';

const depthOf = (path: string) => path.split('/').length;

const isInfoFile = (path: string) => path === INFO_FILE || path.endsWith(`/${INFO_FILE}`);

const isBagMetadata = (path: string) => path === BAG_METADATA_FILE || path.endsWith(`/${BAG_METADATA_FILE}`);

export const isMcapName = (path: string) => /\.mcap$/i.test(path);

export const isBagName = (path: string) => /\.bag$/i.test(path);

const isRecordingName = (path: string) => isMcapName(path) || isBagName(path);

export function isLeRobotFolder(paths: string[]): string | null {
  const infos = pathsByDepth(paths.filter(isInfoFile));

  return infos.length ? infos[0].path.slice(0, -INFO_FILE.length).replace(/\/$/, '') : null;
}

export function isRosbag2Folder(paths: string[]): string | null {
  const prefixes = paths.filter(isBagMetadata).map((path) => path.slice(0, path.length - BAG_METADATA_FILE.length));

  if (prefixes.length === 0) return null;

  return prefixes.reduce((best, prefix) => (depthOf(prefix) < depthOf(best) ? prefix : best));
}

export function sourceKind(paths: string[]): 'lerobot' | 'rosbag2' | 'mcap' | ImageSourceKind | null {
  if (isLeRobotFolder(paths) !== null) return 'lerobot';

  if (isRosbag2Folder(paths) !== null) return 'rosbag2';

  return paths.length && paths.every(isRecordingName) ? 'mcap' : imageSourceKind(paths);
}
