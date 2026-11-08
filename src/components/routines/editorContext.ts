import { createContext, use } from 'react';
import type { InsertPoint } from '../../routines/edit';
import type { Routine, SkillContract } from '../../routines/schema';
import type { RoutineEditor } from '../../workspace/useRoutineEditor';

export interface EditorContextValue {
  editor: RoutineEditor;
  routine: Routine;
  skills: readonly SkillContract[];
  points: Map<string, InsertPoint>;
  onTrain: (skill: string) => void;
}

export const EditorContext = createContext<EditorContextValue | null>(null);

export function useEditorContext(): EditorContextValue {
  const value = use(EditorContext);

  if (!value) throw new Error('A Routine editor part was drawn outside the Routine editor.');

  return value;
}
