import { ROBOT_CATEGORIES, ROBOT_PRESETS, type RobotCategory, type RobotPreset } from '../../utils/robotImport/presets';
import { rawUrl } from '../../utils/robotImport/sources';
import { presetPreviewUrl, type ImportedRobot } from '../../utils/robotPreview';

export const IMPORTED = 'Imported';

export type RobotGroup = RobotCategory | typeof IMPORTED;

export interface RobotEntry {
  key: string;
  preset: RobotPreset;
  group: RobotGroup;
  meta: string;
  images: Array<string | undefined>;
  imported?: ImportedRobot;
}

export function sourceOf(url: string): string {
  const m = /^https?:\/\/(?:raw\.githubusercontent\.com|github\.com)\/([^/]+)\/([^/]+)/.exec(url);

  if (m) return `${m[1]}/${m[2]}`;

  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

const asPreset = (r: ImportedRobot): RobotPreset => ({
  id: r.url,
  title: r.name,
  maker: '',
  category: 'Humanoids',
  joints: r.joints,
  description: '',
  url: r.url,
});

const PRESET_URLS = new Set(ROBOT_PRESETS.map((p) => rawUrl(p.url)));

export function robotEntries(remembered: ImportedRobot[]): RobotEntry[] {
  const thumbnailOf = (p: RobotPreset) => remembered.find((r) => rawUrl(r.url) === rawUrl(p.url))?.thumbnail;
  const imported: RobotEntry[] = remembered
    .filter((r) => !PRESET_URLS.has(rawUrl(r.url)))
    .map((r) => ({
      key: r.url,
      preset: asPreset(r),
      group: IMPORTED,
      meta: sourceOf(r.url),
      images: [r.thumbnail],
      imported: r,
    }));
  const presets: RobotEntry[] = ROBOT_PRESETS.map((p) => ({
    key: p.id,
    preset: p,
    group: p.category,
    meta: p.maker,
    images: [presetPreviewUrl(p.id), thumbnailOf(p)],
  }));

  return [...imported, ...presets];
}

export const ROBOT_GROUPS: RobotGroup[] = [IMPORTED, ...ROBOT_CATEGORIES];

export const robotsIn = (entries: RobotEntry[], group: RobotGroup) => entries.filter((e) => e.group === group);
