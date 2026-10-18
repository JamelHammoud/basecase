import { DEFAULT_PROJECT, type ProjectSettings, type ScenePart } from '../types/robotics';
import { uniqueJointIds } from '../utils/kinematics';

export const normalizeProject = (p: ProjectSettings): ProjectSettings => {
  const joints = p.joints ? uniqueJointIds(p.joints) : p.joints;

  return joints === p.joints ? p : { ...p, joints };
};

export const projectFromSeed = (project?: ProjectSettings): ProjectSettings =>
  normalizeProject({ ...DEFAULT_PROJECT, ...project });

export function copyName(name: string, taken: string[]): string {
  const stem = `${name.replace(/ copy( \d+)?$/, '')} copy`;
  let n = 1;
  let next = stem;

  while (taken.includes(next)) next = `${stem} ${++n}`;

  return next;
}

export const newId = (prefix = 'part') =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;

export const modelId = () => `model-${Date.now().toString(36)}`;

export const listNames = (names: string[]) =>
  names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

export const fileSafe = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'robotics-mechanism';

export const stamp = () => new Date().toISOString();

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const isTextEntry = (el: Element | null) =>
  el instanceof HTMLInputElement ||
  el instanceof HTMLTextAreaElement ||
  (el instanceof HTMLElement && el.isContentEditable);

export const selectableIds = (parts: ScenePart[], showReferenceImages: boolean) =>
  parts.filter((p) => p.visible && (showReferenceImages || p.kind !== 'image_plane')).map((p) => p.id);

export const partLabel = (parts: ScenePart[]) => (parts.length === 1 ? parts[0].name : `${parts.length} parts`);

export type Attempt<T> = { ok: true; value: T } | { ok: false; error: unknown };

export async function attempt<T>(run: () => Promise<T>): Promise<Attempt<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    return { ok: false, error };
  }
}

export function withFlag(flag: { current: boolean }, run: () => void) {
  flag.current = true;

  try {
    run();
  } finally {
    flag.current = false;
  }
}
