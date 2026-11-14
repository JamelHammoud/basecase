import { CoachIcon, CompareIcon, UndoIcon, type ContextMenuEntry } from '../../design-system';
import type { SkillRow } from '../../skills/skillRows';
import { canCoach, type SkillCoachState } from '../../workspace/useSkillCoach';

const ic = 'w-4 h-4';

export function skillMenuItems(row: SkillRow, coach: SkillCoachState, coaches: boolean): ContextMenuEntry[] {
  const items: ContextMenuEntry[] =
    coaches && canCoach(row)
      ? [{ label: 'Coach', icon: <CoachIcon className={ic} />, onSelect: () => coach.start(row) }]
      : [];

  if (!row.record?.coach || row.state.kind !== 'ready') return items;

  const undo: ContextMenuEntry[] = coach.canUndo(row)
    ? [{ label: 'Undo Coach', icon: <UndoIcon className={ic} />, onSelect: () => coach.undo(row) }]
    : [];

  return [
    ...items,
    { label: 'Compare', icon: <CompareIcon className={ic} />, onSelect: () => void coach.replay(row) },
    ...undo,
  ];
}
