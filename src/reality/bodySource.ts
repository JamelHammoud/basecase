import { sameProjectInputs } from '../utils/projectInputs';
import type { ProjectSettings } from '../types/robotics';

export const BODY_SOURCE_VERSION = 2;

export type BodySourceVersion = 1 | 2;

export const bodySourceProject = (project: ProjectSettings, version: BodySourceVersion = BODY_SOURCE_VERSION) => ({
  ...project,
  bodyEvidence: undefined,
  ...(version === BODY_SOURCE_VERSION ? { buildGuide: undefined } : {}),
});

export const validBodySourceVersion = (version: unknown) => version === undefined || version === 1 || version === 2;

export const bodyProjectUnchanged = sameProjectInputs;
