import type { ContextMenuEntry } from '../../design-system';
import { signalNumber } from '../../skills/coachSignals';
import type { SkillRow } from '../../skills/skillRows';
import { canCoach, type SkillCoachState } from '../../workspace/useSkillCoach';

export function skillMenuItems(row: SkillRow, coach: SkillCoachState, coaches: boolean): ContextMenuEntry[] {
  const tag = row.record?.coach;
  const items: ContextMenuEntry[] =
    coaches && canCoach(row) ? [{ label: 'Coach', onSelect: () => coach.start(row) }] : [];

  if (!tag || row.state.kind !== 'ready') return items;

  const moved = `${signalNumber(tag.signal, tag.before)} → ${signalNumber(tag.signal, tag.after)}`;
  const undo: ContextMenuEntry[] = coach.canUndo(row) ? [{ label: 'Undo Coach', onSelect: () => coach.undo(row) }] : [];

  return [...items, { label: moved, onSelect: () => void coach.replay(row) }, ...undo];
}
