import { type RefObject, useState } from 'react';
import { newRoutine, type RoutineEdit } from '../routines/edit';
import { moverFor } from '../routines/routineNeeds';
import { editInSet, putInSet } from '../routines/routineSet';
import type { Capability, Routine, RoutineError } from '../routines/schema';
import type { ProjectSettings } from '../types/robotics';
import { routinesView } from './caseLogicRoutines';
import { newId } from './helpers';

interface StoreOptions {
  project: ProjectSettings;
  projectRef: RefObject<ProjectSettings>;
  commitRoutines: (list: readonly Routine[]) => void;
  capabilities: () => Capability[];
}

export interface EditResult {
  changed: boolean;
  errors?: RoutineError[];
}

export function nextRoutineName(routines: readonly Routine[]): string {
  const taken = new Set(routines.map((r) => r.name));
  let n = routines.length + 1;

  while (taken.has(`Routine ${n}`)) n += 1;

  return `Routine ${n}`;
}

export function useRoutineStore({ project, projectRef, commitRoutines, capabilities }: StoreOptions) {
  const routines = routinesView(project);
  const [chosen, setChosen] = useState<string | null>(null);
  const active = routines.find((r) => r.id === chosen) ?? routines[0] ?? null;

  const current = () => routinesView(projectRef.current);

  const change = (next: (routines: Routine[]) => Routine[]): boolean => {
    const before = current();
    const after = next(before);

    if (after === before) return false;

    commitRoutines(after);

    return true;
  };

  const activeIn = (list: readonly Routine[]) => list.find((r) => r.id === chosen) ?? list[0] ?? null;

  const edit = (edits: readonly RoutineEdit[], id?: string): EditResult => {
    let errors: RoutineError[] | undefined;
    const changed = change((list) => {
      const result = editInSet(list, { id: id ?? activeIn(list)?.id, edits, capabilities: capabilities() });

      errors = result.errors;

      return result.list;
    });

    return errors ? { changed, errors } : { changed };
  };

  const create = (): Routine => {
    const routine = newRoutine({
      id: newId('routine'),
      name: nextRoutineName(current()),
      mover: moverFor(capabilities()),
    });

    change((list) => [...list, routine]);
    setChosen(routine.id);

    return routine;
  };

  const put = (routine: Routine) => {
    change((list) => putInSet(list, routine));
    setChosen(routine.id);
  };

  const remove = (id: string) => change((list) => list.filter((r) => r.id !== id));

  return {
    routines,
    active,
    select: setChosen,
    create,
    put,
    edit,
    rename: (id: string, name: string) => edit([{ op: 'rename', name }], id).changed,
    remove,
  };
}

export type RoutineStore = ReturnType<typeof useRoutineStore>;
