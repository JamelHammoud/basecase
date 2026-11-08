import { applyEdits, type RoutineEdit } from './edit';
import { withNeeds } from './routineNeeds';
import { type Capability, type Routine, type RoutineError, validateRoutine } from './schema';

export interface SetEdit {
  id: string | undefined;
  edits: readonly RoutineEdit[];
  capabilities: readonly Capability[];
}

export function editInSet(
  list: Routine[],
  { id, edits, capabilities }: SetEdit,
): { list: Routine[]; errors?: RoutineError[] } {
  const index = list.findIndex((r) => r.id === id);
  const edited = index < 0 ? null : applyEdits(list[index], edits);

  if (!edited || edited === list[index]) return { list };

  const valid = validateRoutine(withNeeds(edited, capabilities));

  if (!valid.ok) return { list, errors: valid.errors };

  return { list: list.map((r, i) => (i === index ? valid.routine : r)) };
}

export function putInSet(list: Routine[], routine: Routine): Routine[] {
  if (!list.some((r) => r.id === routine.id)) return [...list, routine];

  return list.map((r) => (r.id === routine.id ? routine : r));
}
