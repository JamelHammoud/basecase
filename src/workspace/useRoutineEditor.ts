import { useState } from 'react';
import { connectTarget, pointAfter, type RoutineEdit, RoutineIndex, type StepAt, uniqueStepId } from '../routines/edit';
import { routineToFlow } from '../routines/flow';
import { stepTitle } from '../routines/flowLabels';
import type { Routine } from '../routines/schema';
import { stopStep } from '../routines/stepFactory';
import type { ShowToast } from './types';
import type { RoutineStore } from './useRoutineStore';

function titleOf(routine: Routine, id: string): string {
  const node = routineToFlow(routine).nodes.find((n) => n.id === id);

  return node ? stepTitle(node) : id;
}

const insertedId = (edits: readonly RoutineEdit[]) => {
  const insert = edits.find((e) => e.op === 'insert');

  return insert?.op === 'insert' ? (insert.step.id ?? null) : null;
};

interface EditorFeedback {
  showToast: ShowToast;
  undo: () => void;
}

export function useRoutineEditor(store: RoutineStore, { showToast, undo }: EditorFeedback) {
  const [picked, setPicked] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const routine = store.active;
  const exists = (id: string | null) =>
    !!routine && id !== null && routineToFlow(routine).nodes.some((n) => n.id === id && n.kind !== 'end');
  const selected = exists(picked) ? picked : null;

  const remove = (id: string) => {
    if (!routine) return;

    const name = titleOf(routine, id);

    if (!store.edit([{ op: 'remove', id }]).changed) return;

    setPicked(null);
    showToast(`Deleted ${name}`, { action: { label: 'Undo', onClick: undo } });
  };

  const add = (edits: readonly RoutineEdit[]) => {
    setAdding(null);

    if (store.edit(edits).changed) setPicked(insertedId(edits));
  };

  const stopBefore = (id: string) => {
    const found = routine && new RoutineIndex(routine).byId.get(id);

    if (!routine || !found?.container) return;

    add([
      {
        op: 'insert',
        at: { seq: found.container.ref, index: found.index },
        step: stopStep(uniqueStepId(routine, 'stop')),
      },
    ]);
  };

  const move = (id: string, to: StepAt) => {
    if (store.edit([{ op: 'move', id, to }]).changed) setPicked(id);
  };

  const connect = (source: string, target: string, handle: string | null) => {
    const to = routine && connectTarget(routine, source, handle);

    if (to) move(target, to);
  };

  const addHere = () => {
    const point = routine && pointAfter(routine, selected);

    if (point) setAdding(point.key);
  };

  return {
    selected,
    select: setPicked,
    adding,
    setAdding,
    add,
    addHere,
    addAfter: (id: string) => {
      const point = routine && pointAfter(routine, id);

      if (point) setAdding(point.key);
    },
    move,
    connect,
    update: (id: string, patch: Record<string, unknown>) => store.edit([{ op: 'update', id, patch }]),
    apply: (edits: readonly RoutineEdit[]) => store.edit(edits),
    stopBefore,
    remove,
    removeSelected: () => selected && remove(selected),
  };
}

export type RoutineEditor = ReturnType<typeof useRoutineEditor>;
