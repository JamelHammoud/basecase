import { CoachIcon, CompareIcon, CrosshairIcon, UndoIcon, type ContextMenuEntry } from '../../design-system';
import type { SkillRow } from '../../skills/skillRows';
import { canCoach, type SkillCoachState } from '../../workspace/useSkillCoach';
import { canStress, type SkillStressState } from '../../workspace/useSkillStress';

export interface CoachMenuOptions {
  coach: SkillCoachState;
  coaches: boolean;
}

export function coachMenuItems(row: SkillRow, { coach, coaches }: CoachMenuOptions): ContextMenuEntry[] {
  const items: ContextMenuEntry[] =
    coaches && canCoach(row) ? [{ label: 'Coach', icon: <CoachIcon />, onSelect: () => coach.start(row) }] : [];

  if (!row.record?.coach || row.state.kind !== 'ready') return items;

  const undo: ContextMenuEntry[] = coach.canUndo(row)
    ? [{ label: 'Undo Coach', icon: <UndoIcon />, onSelect: () => coach.undo(row) }]
    : [];

  return [...items, { label: 'Compare', icon: <CompareIcon />, onSelect: () => void coach.replay(row) }, ...undo];
}

export const stressMenuItems = (row: SkillRow, stress: SkillStressState): ContextMenuEntry[] =>
  canStress(row) ? [{ label: 'Stress', icon: <CrosshairIcon />, onSelect: () => void stress.start(row) }] : [];
