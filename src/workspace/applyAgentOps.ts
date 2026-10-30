import { applySpec, describeOp, mirrorParts, opTarget, specToPart, type AgentOp } from '../agent/agentScene';
import type { Viewport3DHandle } from '../components/Viewport3D';
import { followedText, followMates } from '../agent/mateFollow';
import { alignToSkeleton } from '../agent/skeletonMirror';
import type { ScenePart } from '../types/robotics';
import { sleep } from './helpers';
import { twinHints } from './mirrorHints';
import type { CommitParts, Vec3 } from './types';

export interface AgentOpsContext {
  current: () => ScenePart[];
  commitParts: CommitParts;
  viewport: () => Viewport3DHandle | null;
  setCursor: (target: Vec3) => void;
  setAction: (action: string) => void;
  isFollowing: () => boolean;
  guard: (partId: string) => string | null;
  touch: (partId: string) => void;
}

interface OpLog {
  added: string[];
  updated: string[];
  removed: string[];
  mirrored: string[];
  replaced: string[];
  problems: string[];
  notes: string[];
}

interface OpStep<T extends AgentOp['op']> {
  op: Extract<AgentOp, { op: T }>;
  current: ScenePart[];
  live: boolean;
  ctx: AgentOpsContext;
  log: OpLog;
  pace: (ms: number) => Promise<void>;
}

const VERBS: Record<AgentOp['op'], string> = {
  add: 'Adding',
  update: 'Adjusting',
  delete: 'Removing',
  mirror: 'Mirroring',
};

const OP_DELAY_MS = { add: 260, other: 160, mirrorCopy: 140, settle: 30 };
const ANIMATION_BUDGET_MS = 600;

const plannedDelay = (op: AgentOp) =>
  (op.op === 'add' ? OP_DELAY_MS.add : OP_DELAY_MS.other) +
  OP_DELAY_MS.settle +
  (op.op === 'mirror' ? op.ids.length * OP_DELAY_MS.mirrorCopy : 0);

export function animationPacer(ops: AgentOp[], wait: (ms: number) => Promise<unknown> = sleep) {
  const planned = ops.reduce((sum, op) => sum + plannedDelay(op), 0);
  const scale = planned > ANIMATION_BUDGET_MS ? ANIMATION_BUDGET_MS / planned : 1;
  let left = ANIMATION_BUDGET_MS;

  return async (ms: number) => {
    const delay = Math.min(left, Math.round(ms * scale));

    left -= delay;

    if (delay > 0) await wait(delay);
  };
}

function claim(ctx: AgentOpsContext, log: OpLog, partId: string) {
  const blocked = ctx.guard(partId);

  if (blocked) {
    log.problems.push(blocked);

    return false;
  }

  ctx.touch(partId);

  return true;
}

function applyAdd({ op, current, live, ctx, log }: OpStep<'add'>) {
  let part: ScenePart;

  try {
    part = specToPart(op.part);
  } catch (err) {
    log.problems.push(String((err as Error).message ?? err));

    return false;
  }

  if (!claim(ctx, log, part.id)) return false;

  const exists = current.some((p) => p.id === part.id);

  ctx.commitParts((prev) => (exists ? prev.map((p) => (p.id === part.id ? part : p)) : [...prev, part]), live);
  ctx.viewport()?.animateSpawn([part.id]);
  log.added.push(part.id);

  return true;
}

function applyUpdate({ op, current, live, ctx, log }: OpStep<'update'>) {
  if (!current.some((p) => p.id === op.part.id)) {
    log.problems.push(`${op.part.id} not found`);

    return true;
  }

  if (!claim(ctx, log, op.part.id)) return false;

  ctx.commitParts((prev) => prev.map((p) => (p.id === op.part.id ? applySpec(p, op.part) : p)), live);
  log.updated.push(op.part.id);

  return true;
}

function applyDelete({ op, current, live, ctx, log }: OpStep<'delete'>) {
  if (!current.some((p) => p.id === op.id)) log.problems.push(`${op.id} not found`);

  if (!claim(ctx, log, op.id)) return false;

  ctx.commitParts((prev) => prev.filter((p) => p.id !== op.id), live);
  log.removed.push(op.id);

  return true;
}

async function applyMirror({ op, current, live, ctx, log, pace }: OpStep<'mirror'>) {
  const aligned = alignToSkeleton(mirrorParts(current, op.ids, op.axis, op.rename), op.skeleton, op.axis);
  const copies = aligned.copies.filter((c) => claim(ctx, log, c.id));

  log.notes.push(...aligned.notes);

  for (let j = 0; j < copies.length; j++) {
    const c = copies[j];

    ctx.setCursor([c.position[0], c.position[1] + c.dimensions.height / 2, c.position[2]]);
    await pace(OP_DELAY_MS.mirrorCopy);
    ctx.commitParts((prev) => [...prev.filter((p) => p.id !== c.id), c], live || j < copies.length - 1);
    ctx.viewport()?.animateSpawn([c.id]);
    log.added.push(c.id);
    log.mirrored.push(c.id);

    if (current.some((p) => p.id === c.id)) log.replaced.push(c.id);
  }

  const missing = op.ids.filter((id) => !current.some((p) => p.id === id));

  if (missing.length) log.problems.push(`not found: ${missing.join(', ')}`);

  return true;
}

function applyOp(op: AgentOp, step: Omit<OpStep<AgentOp['op']>, 'op'>): boolean | Promise<boolean> {
  switch (op.op) {
    case 'add':
      return applyAdd({ ...step, op });
    case 'update':
      return applyUpdate({ ...step, op });
    case 'delete':
      return applyDelete({ ...step, op });
    case 'mirror':
      return applyMirror({ ...step, op });
  }
}

function summary(log: OpLog, hints: string[]) {
  const done = [
    log.added.length ? `added ${log.added.join(', ')}` : '',
    log.updated.length ? `updated ${log.updated.join(', ')}` : '',
    log.removed.length ? `deleted ${log.removed.join(', ')}` : '',
  ].filter(Boolean);

  return [
    `${done.join('; ') || 'No changes'}.`,
    log.replaced.length ? `Mirroring replaced the old ${log.replaced.join(', ')}.` : '',
    log.problems.length ? `Problems: ${log.problems.join('; ')}.` : '',
    ...log.notes,
    ...hints,
  ]
    .filter(Boolean)
    .join(' ');
}

const placedIds = (ops: AgentOp[]) =>
  new Set(
    ops.flatMap((op) => {
      if (op.op === 'add') return [op.part.id];

      return op.op === 'update' && (op.part.position || op.part.rotation) ? [op.part.id] : [];
    }),
  );

function settle(ctx: AgentOpsContext, log: OpLog, before: ScenePart[], placed: Set<string>): string[] {
  const edited = log.added.length + log.updated.length + log.removed.length > 0;

  if (!edited) return [];

  const result = followMates({ before, after: ctx.current(), placed });
  const moved = new Map(result.updated.filter((p) => claim(ctx, log, p.id)).map((p) => [p.id, p]));

  ctx.commitParts((prev) => (moved.size ? prev.map((p) => moved.get(p.id) ?? p) : prev), false);

  return followedText(result);
}

export async function applyAgentOps(ops: AgentOp[], ctx: AgentOpsContext): Promise<string> {
  const log: OpLog = { added: [], updated: [], removed: [], mirrored: [], replaced: [], problems: [], notes: [] };
  const total = ops.length;
  const pace = animationPacer(ops);
  const before = ctx.current();

  for (let i = 0; i < total; i++) {
    const op = ops[i];
    const current = ctx.current();
    const target = opTarget(op, current);

    if (target) ctx.setCursor(target);

    ctx.setAction(`${VERBS[op.op] ?? VERBS.mirror} ${describeOp(op, current)}`);
    await pace(op.op === 'add' ? OP_DELAY_MS.add : OP_DELAY_MS.other);

    const applied = await applyOp(op, { current, live: true, ctx, log, pace });

    if (applied !== false) await pace(OP_DELAY_MS.settle);
  }

  const followed = settle(ctx, log, before, placedIds(ops));

  ctx.setAction('');

  if (ctx.isFollowing() && (log.added.length || log.removed.length)) ctx.viewport()?.frameAll();

  const edited = [...log.added, ...log.updated].filter((id) => !log.mirrored.includes(id));

  return summary(log, [...followed, ...twinHints(edited, before, ctx.current())]);
}
