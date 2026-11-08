import { CHILD_KEYS } from './flowTypes';
import { RoutineIndex, type StepAt } from './editLocate';
import type { Capability, Routine, Step, Watcher } from './schema';

export type { InsertPoint, SeqRef, StepAt } from './editLocate';
export { insertPoints, RoutineIndex } from './editLocate';

export type RoutineEdit =
  | { op: 'insert'; at: StepAt; step: Step }
  | { op: 'remove'; id: string }
  | { op: 'move'; id: string; to: StepAt }
  | { op: 'update'; id: string; patch: Record<string, unknown> }
  | { op: 'addWatcher'; watcher: Watcher }
  | { op: 'rename'; name: string };

export const START_ID = 'start';
export const START_MS = 500;

const CHILDREN = new Set<string>(CHILD_KEYS);

export function newRoutine(options: { id: string; name: string; mover: Capability }): Routine {
  return {
    schema: 1,
    id: options.id,
    name: options.name,
    requires: [options.mover],
    base: {
      kind: 'do',
      id: START_ID,
      skill: 'settle',
      holds: ['body'],
      timeoutMs: START_MS,
      onTimeout: [],
      onFail: [],
    },
    watchers: [],
    reactions: [],
    safeStop: 'settle',
  };
}

export function uniqueStepId(routine: Routine, base: string): string {
  const taken = new Set(new RoutineIndex(routine).ids());
  const root = base.replace(/[^\w-]/g, '').replace(/^[^A-Za-z]+/, '') || 'step';

  if (!taken.has(root)) return root;

  let n = 2;

  while (taken.has(`${root}${n}`)) n += 1;

  return `${root}${n}`;
}

function insertInto(index: RoutineIndex, at: StepAt, step: Step): boolean {
  const container = index.container(at.seq);

  if (!container || at.index < 0 || at.index > container.steps.length) return false;

  container.steps.splice(at.index, 0, step);

  return true;
}

function removeFrom(index: RoutineIndex, id: string): boolean {
  const found = index.byId.get(id);

  if (found?.container) {
    found.container.steps.splice(found.index, 1);

    return true;
  }

  const routine = index.routine;
  const watchers = routine.watchers.filter((w) => w.id !== id);
  const reactions = routine.reactions.filter((r) => r.id !== id);
  const changed = watchers.length !== routine.watchers.length || reactions.length !== routine.reactions.length;

  routine.watchers = watchers;
  routine.reactions = reactions;

  return changed;
}

function moveWithin(index: RoutineIndex, id: string, to: StepAt): boolean {
  const found = index.byId.get(id);
  const target = index.container(to.seq);

  if (!found?.container || !target || index.subtree(id).has(to.seq.parent)) return false;

  const sameSeq = target === found.container;
  const at = sameSeq && found.index < to.index ? to.index - 1 : to.index;

  if (sameSeq && at === found.index) return false;

  found.container.steps.splice(found.index, 1);

  if (at < 0 || at > target.steps.length) return false;

  target.steps.splice(at, 0, found.step);

  return true;
}

function updateIn(index: RoutineIndex, id: string, patch: Record<string, unknown>): boolean {
  const step = index.byId.get(id)?.step as Record<string, unknown> | undefined;
  const owner =
    step ?? index.routine.watchers.find((w) => w.id === id) ?? index.routine.reactions.find((r) => r.id === id);

  if (!owner) return false;

  const target = owner as Record<string, unknown>;

  for (const [key, value] of Object.entries(patch)) {
    if (CHILDREN.has(key) || key === 'kind' || key === 'id') continue;

    if (value === undefined) delete target[key];
    else target[key] = structuredClone(value);
  }

  return true;
}

function addWatcher(routine: Routine, watcher: Watcher): boolean {
  if (routine.watchers.some((w) => w.id === watcher.id)) return false;

  routine.watchers.push(structuredClone(watcher));

  return true;
}

function renameRoutine(routine: Routine, name: string): boolean {
  const trimmed = name.trim();

  if (!trimmed || trimmed === routine.name) return false;

  routine.name = trimmed;

  return true;
}

function applyTo(draft: Routine, edit: RoutineEdit): boolean {
  const index = new RoutineIndex(draft);

  switch (edit.op) {
    case 'insert':
      return insertInto(index, edit.at, structuredClone(edit.step));
    case 'remove':
      return edit.id !== index.baseId && removeFrom(index, edit.id);
    case 'move':
      return moveWithin(index, edit.id, edit.to);
    case 'update':
      return updateIn(index, edit.id, edit.patch);
    case 'addWatcher':
      return addWatcher(draft, edit.watcher);
    default:
      return renameRoutine(draft, edit.name);
  }
}

export function applyEdit(routine: Routine, edit: RoutineEdit): Routine {
  const draft = structuredClone(routine);

  return applyTo(draft, edit) ? draft : routine;
}

export function applyEdits(routine: Routine, edits: readonly RoutineEdit[]): Routine {
  return edits.reduce(applyEdit, routine);
}
