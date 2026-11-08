import type { RoutineEdit } from '../../routines/edit';
import type { FlowNode } from '../../routines/flowTypes';
import type { Routine, SkillContract } from '../../routines/schema';

export interface FieldProps {
  node: FlowNode;
  routine: Routine;
  skills: readonly SkillContract[];
  update: (patch: Record<string, unknown>) => void;
  apply: (edits: readonly RoutineEdit[]) => void;
}

export const seconds = (ms: unknown) => Number(ms ?? 0) / 1000;
