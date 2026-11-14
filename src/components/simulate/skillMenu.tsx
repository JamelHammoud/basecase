import { CoachIcon, CompareIcon, ShareIcon, UndoIcon, type ContextMenuEntry } from '../../design-system';
import type { SkillRow } from '../../skills/skillRows';
import { canCoach, type SkillCoachState } from '../../workspace/useSkillCoach';

const ic = 'w-4 h-4';

export interface SkillMenuOptions {
  coach: SkillCoachState;
  coaches: boolean;
  publish: ((row: SkillRow) => void) | null;
}

function coachItems(row: SkillRow, { coach, coaches }: SkillMenuOptions): ContextMenuEntry[] {
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

export function skillMenuItems(row: SkillRow, options: SkillMenuOptions): ContextMenuEntry[] {
  const { publish } = options;
  const shared: ContextMenuEntry[] =
    publish && row.state.kind === 'ready'
      ? [{ label: 'Publish to Hugging Face', icon: <ShareIcon className={ic} />, onSelect: () => publish(row) }]
      : [];

  return [...coachItems(row, options), ...shared];
}
