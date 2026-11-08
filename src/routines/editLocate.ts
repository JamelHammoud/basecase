import { CompileContext } from './compileContext';
import { endNodeId } from './flowTypes';
import type { Routine, Step } from './schema';
import { isGuarded } from './schema';

export type SeqKey = 'steps' | 'then' | 'else' | 'onTimeout' | 'onFail' | 'branches';

export interface SeqRef {
  parent: string;
  key: SeqKey;
  branch?: number;
}

export interface StepAt {
  seq: SeqRef;
  index: number;
}

export interface Container {
  ref: SeqRef;
  steps: Step[];
}

export interface Located {
  step: Step;
  container: Container | null;
  index: number;
}

export type InsertKind = 'next' | 'then' | 'else' | 'timeout' | 'fail' | 'branch' | 'after';

export interface InsertPoint {
  key: string;
  at: StepAt;
  from: string;
  to: string | null;
  kind: InsertKind;
}

const GUARD_KEYS = [
  ['onTimeout', 'timeout'],
  ['onFail', 'fail'],
] as const;

export const stepNames = (routine: Routine): Map<Step, string> => new CompileContext(routine, { skills: [] }).names;

export function childContainers(step: Step, id: string): Container[] {
  if (isGuarded(step)) return GUARD_KEYS.map(([key]) => ({ ref: { parent: id, key }, steps: step[key] }));

  if (step.kind === 'if') {
    return [
      { ref: { parent: id, key: 'then' }, steps: step.then },
      { ref: { parent: id, key: 'else' }, steps: step.else },
    ];
  }

  return step.branches.map((steps, branch) => ({ ref: { parent: id, key: 'branches', branch }, steps }));
}

export class RoutineIndex {
  readonly names: Map<Step, string>;
  readonly containers: Container[] = [];
  readonly byId = new Map<string, Located>();
  readonly routine: Routine;

  constructor(routine: Routine) {
    this.routine = routine;
    this.names = stepNames(routine);
    this.visit(routine.base, null, 0);

    for (const reaction of routine.reactions)
      this.sequence({ ref: { parent: reaction.id, key: 'steps' }, steps: reaction.steps });
  }

  private sequence(container: Container) {
    this.containers.push(container);
    container.steps.forEach((step, index) => this.visit(step, container, index));
  }

  private visit(step: Step, container: Container | null, index: number) {
    const id = this.nameOf(step);

    this.byId.set(id, { step, container, index });

    for (const child of childContainers(step, id)) this.sequence(child);
  }

  nameOf(step: Step): string {
    return this.names.get(step) ?? step.kind;
  }

  get baseId(): string {
    return this.nameOf(this.routine.base);
  }

  container(ref: SeqRef): Container | undefined {
    return this.containers.find(
      (c) => c.ref.parent === ref.parent && c.ref.key === ref.key && (c.ref.branch ?? 0) === (ref.branch ?? 0),
    );
  }

  subtree(id: string): Set<string> {
    const found = new Set<string>();
    const walk = (step: Step) => {
      const name = this.nameOf(step);

      found.add(name);

      for (const child of childContainers(step, name)) child.steps.forEach(walk);
    };
    const start = this.byId.get(id);

    if (start) walk(start.step);

    return found;
  }

  ids(): string[] {
    return [...this.byId.keys(), ...this.routine.watchers.map((w) => w.id), ...this.routine.reactions.map((r) => r.id)];
  }
}

const FIRST_KIND: Record<SeqKey, InsertKind> = {
  steps: 'next',
  then: 'then',
  else: 'else',
  onTimeout: 'timeout',
  onFail: 'fail',
  branches: 'branch',
};

function emptyTarget(ref: SeqRef): string | null {
  if (ref.key === 'onTimeout') return endNodeId(ref.parent, 'timeout');

  if (ref.key === 'onFail') return endNodeId(ref.parent, 'fail');

  return ref.key === 'branches' ? endNodeId(ref.parent, `branch${ref.branch ?? 0}`) : null;
}

const refKey = (ref: SeqRef) => `${ref.parent}:${ref.key}${ref.branch ?? ''}`;

function containerPoints(index: RoutineIndex, container: Container): InsertPoint[] {
  const { ref, steps } = container;
  const ids = steps.map((s) => index.nameOf(s));
  const first: InsertPoint = {
    key: `${refKey(ref)}:0`,
    at: { seq: ref, index: 0 },
    from: ref.parent,
    to: ids[0] ?? emptyTarget(ref),
    kind: FIRST_KIND[ref.key],
  };
  const later = ids.map((id, i): InsertPoint => {
    const next = ids[i + 1] ?? null;

    return {
      key: `${refKey(ref)}:${i + 1}`,
      at: { seq: ref, index: i + 1 },
      from: id,
      to: next,
      kind: next === null ? 'after' : 'next',
    };
  });

  return [first, ...later];
}

export function insertPoints(routine: Routine): InsertPoint[] {
  const index = new RoutineIndex(routine);

  return index.containers.flatMap((c) => containerPoints(index, c));
}

const sameRef = (a: SeqRef, b: SeqRef) =>
  a.parent === b.parent && a.key === b.key && (a.branch ?? 0) === (b.branch ?? 0);

function endOf(points: InsertPoint[], container: Container | undefined): InsertPoint | null {
  if (!container) return null;

  return points.find((p) => sameRef(p.at.seq, container.ref) && p.at.index === container.steps.length) ?? null;
}

export function pointAfter(routine: Routine, id: string | null): InsertPoint | null {
  const index = new RoutineIndex(routine);
  const points = index.containers.flatMap((c) => containerPoints(index, c));
  const found = id === null ? undefined : index.byId.get(id);
  const own = found?.container;

  if (own) return points.find((p) => sameRef(p.at.seq, own.ref) && p.at.index === found.index + 1) ?? null;

  const reaction = routine.reactions.find((r) => r.id === id);

  if (reaction) return endOf(points, index.container({ parent: reaction.id, key: 'steps' }));

  return endOf(points, index.container({ parent: index.baseId, key: 'onTimeout' }));
}

export function connectTarget(routine: Routine, source: string, handle: string | null): StepAt | null {
  const index = new RoutineIndex(routine);

  if (handle === 'then' || handle === 'else') return { seq: { parent: source, key: handle }, index: 0 };

  if (source === index.baseId) return { seq: { parent: source, key: 'onTimeout' }, index: 0 };

  if (routine.reactions.some((r) => r.id === source)) return { seq: { parent: source, key: 'steps' }, index: 0 };

  const found = index.byId.get(source);

  return found?.container ? { seq: found.container.ref, index: found.index + 1 } : null;
}
