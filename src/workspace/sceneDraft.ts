import type { ProjectSettings, SceneAnnotation, ScenePart } from '../types/robotics';

export interface SceneDraft {
  sceneId: string;
  sceneName: string;
  globalGoal: string;
  parts: ScenePart[];
  annotations: SceneAnnotation[];
  project: ProjectSettings;
  chatId: string | null;
}

const sameItems = <T>(a: T[], b: T[]) => a === b || (a.length === b.length && a.every((item, i) => item === b[i]));

const sameText = (a: SceneDraft, b: SceneDraft) =>
  a.sceneName === b.sceneName && a.globalGoal === b.globalGoal && a.chatId === b.chatId;

export function draftChanged(saved: SceneDraft, next: SceneDraft): boolean {
  if (!sameText(saved, next)) return true;

  if (!sameItems(saved.parts, next.parts) || !sameItems(saved.annotations, next.annotations)) return true;

  if (saved.project === next.project) return false;

  if (saved.project.study !== next.project.study) return true;

  const savedSettings = { ...saved.project };
  const nextSettings = { ...next.project };

  delete savedSettings.study;
  delete nextSettings.study;

  return JSON.stringify(savedSettings) !== JSON.stringify(nextSettings);
}

export const draftPayload = (draft: SceneDraft) => ({
  id: draft.sceneId,
  name: draft.sceneName,
  globalGoal: draft.globalGoal,
  parts: draft.parts,
  annotations: draft.annotations,
  project: draft.project,
  chatId: draft.chatId,
  autosave: true,
});
