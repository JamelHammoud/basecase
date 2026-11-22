import type { ProjectSettings } from '../types/robotics';

export const BODY_SOURCE_VERSION = 2;

export type BodySourceVersion = 1 | 2;

const metadata = new Set(['bodyEvidence', 'buildGuide']);

export const bodySourceProject = (project: ProjectSettings, version: BodySourceVersion = BODY_SOURCE_VERSION) => ({
  ...project,
  bodyEvidence: undefined,
  ...(version === BODY_SOURCE_VERSION ? { buildGuide: undefined } : {}),
});

export const validBodySourceVersion = (version: unknown) => version === undefined || version === 1 || version === 2;

export function bodyProjectUnchanged(before: object, now: object): boolean {
  if (before === now) return true;

  const keys = new Set([...Object.keys(before), ...Object.keys(now)]);

  return [...keys].every((key) => metadata.has(key) || Reflect.get(before, key) === Reflect.get(now, key));
}
