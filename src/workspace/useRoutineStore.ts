import { type RefObject, useRef, useState } from 'react';
import { newRoutine, type RoutineEdit } from '../routines/edit';
import { commit, type History, redo, undo } from '../routines/editHistory';
import { moverFor } from '../routines/routineNeeds';
import { editInSet, putInSet } from '../routines/routineSet';
import type { Capability, Routine, RoutineError } from '../routines/schema';
import type { ProjectSettings } from '../types/robotics';
import { newId } from './helpers';

interface StoreOptions {
  project: ProjectSettings;
  projectRef: RefObject<ProjectSettings>;
  updateProjectNow: (patch: (p: ProjectSettings) => ProjectSettings) => void;
  capabilities: () => Capability[];
}

type Stacks = Omit<History<Routine[]>, 'present'>;

export interface EditResult {
  changed: boolean;
  errors?: RoutineError[];
}

const NO_ROUTINES: Routine[] = [];

export function nextRoutineName(routines: readonly Routine[]): string {
  const taken = new Set(routines.map((r) => r.name));
  let n = routines.length + 1;

  while (taken.has(`Routine ${n}`)) n += 1;

  return `Routine ${n}`;
}

export function useRoutineStore({ project, projectRef, updateProjectNow, capabilities }: StoreOptions) {
  const routines = project.routines ?? NO_ROUTINES;
  const [chosen, setChosen] = useState<string | null>(null);
  const stacks = useRef<Stacks>({ past: [], future: [] });
  const active = routines.find((r) => r.id === chosen) ?? routines[0] ?? null;

  const current = () => projectRef.current.routines ?? NO_ROUTINES;

  const write = (history: History<Routine[]>) => {
    stacks.current = { past: history.past, future: history.future };
    updateProjectNow((p) => ({ ...p, routines: history.present.length ? history.present : undefined }));
  };

  const change = (next: (routines: Routine[]) => Routine[]): boolean => {
    const before = current();
    const after = next(before);

    if (after === before) return false;

    write(commit({ ...stacks.current, present: before }, after));

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

  const step = (move: typeof undo) => {
    const history = move({ ...stacks.current, present: current() });

    if (history.present === current()) return false;

    write(history);

    return true;
  };

  return {
    routines,
    active,
    select: setChosen,
    create,
    put,
    edit,
    rename: (id: string, name: string) => edit([{ op: 'rename', name }], id).changed,
    remove,
    undo: () => step(undo),
    redo: () => step(redo),
  };
}

export type RoutineStore = ReturnType<typeof useRoutineStore>;
