import { createContext, use } from 'react';
import type { InsertPoint } from '../../routines/edit';
import type { Routine, SkillContract } from '../../routines/schema';
import type { Handoffs } from '../../workspace/useHandoffs';
import type { RoutineEditor } from '../../workspace/useRoutineEditor';

export interface EditorContextValue {
  editor: RoutineEditor;
  routine: Routine;
  skills: readonly SkillContract[];
  points: Map<string, InsertPoint>;
  onTrain: (skill: string) => void;
  handoffs: Pick<Handoffs, 'busy' | 'prove' | 'train'>;
  trainable: ReadonlySet<string>;
}

export const EditorContext = createContext<EditorContextValue | null>(null);

export function useEditorContext(): EditorContextValue {
  const value = use(EditorContext);

  if (!value) throw new Error('A Routine editor part was drawn outside the Routine editor.');

  return value;
}
