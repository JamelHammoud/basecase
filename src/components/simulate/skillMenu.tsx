import {
  CoachIcon,
  CompareIcon,
  CrosshairIcon,
  OperateIcon,
  TrainIcon,
  UndoIcon,
  type ContextMenuEntry,
} from '../../design-system';
import type { SkillRow } from '../../skills/skillRows';
import { canCoach, type SkillCoachState } from '../../workspace/useSkillCoach';
import { canStress, canTrainOnFindings } from '../../workspace/useSkillStress';

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

export interface StressMenuOptions {
  onStress: (row: SkillRow) => void;
  onTrain: (row: SkillRow) => void;
}

export function stressMenuItems(row: SkillRow, { onStress, onTrain }: StressMenuOptions): ContextMenuEntry[] {
  if (!canStress(row)) return [];

  const stress: ContextMenuEntry = { label: 'Stress', icon: <CrosshairIcon />, onSelect: () => onStress(row) };

  if (!canTrainOnFindings(row)) return [stress];

  return [stress, { label: 'Train on These', icon: <TrainIcon />, onSelect: () => onTrain(row) }];
}

export interface RollOutMenu {
  canRollOut: (row: SkillRow) => boolean;
  rollOut: (row: SkillRow) => void;
}

export const rollOutMenuItems = (row: SkillRow, fleet: RollOutMenu): ContextMenuEntry[] =>
  fleet.canRollOut(row) ? [{ label: 'Roll Out', icon: <OperateIcon />, onSelect: () => fleet.rollOut(row) }] : [];
