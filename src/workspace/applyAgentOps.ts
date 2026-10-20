import { applySpec, describeOp, mirrorParts, opTarget, specToPart, type AgentOp } from '../agent/agentScene';
import type { Viewport3DHandle } from '../components/Viewport3D';
import type { ScenePart } from '../types/robotics';
import { sleep } from './helpers';
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
  problems: string[];
}

interface OpStep<T extends AgentOp['op']> {
  op: Extract<AgentOp, { op: T }>;
  current: ScenePart[];
  live: boolean;
  ctx: AgentOpsContext;
  log: OpLog;
}

const VERBS: Record<AgentOp['op'], string> = {
  add: 'Adding',
  update: 'Adjusting',
  delete: 'Removing',
  mirror: 'Mirroring',
};

const OP_DELAY_MS = { add: 260, other: 160, mirrorCopy: 140, settle: 30 };

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

async function applyMirror({ op, current, live, ctx, log }: OpStep<'mirror'>) {
  const copies = mirrorParts(current, op.ids, op.axis, op.rename).filter((c) => claim(ctx, log, c.id));

  for (let j = 0; j < copies.length; j++) {
    const c = copies[j];

    ctx.setCursor([c.position[0], c.position[1] + c.dimensions.height / 2, c.position[2]]);
    await sleep(OP_DELAY_MS.mirrorCopy);
    ctx.commitParts((prev) => [...prev.filter((p) => p.id !== c.id), c], live || j < copies.length - 1);
    ctx.viewport()?.animateSpawn([c.id]);
    log.added.push(c.id);
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

function summary(log: OpLog) {
  const done = [
    log.added.length ? `added ${log.added.join(', ')}` : '',
    log.updated.length ? `updated ${log.updated.join(', ')}` : '',
    log.removed.length ? `deleted ${log.removed.join(', ')}` : '',
  ].filter(Boolean);

  return `${done.join('; ') || 'No changes'}.${log.problems.length ? ` Problems: ${log.problems.join('; ')}.` : ''}`;
}

export async function applyAgentOps(ops: AgentOp[], ctx: AgentOpsContext): Promise<string> {
  const log: OpLog = { added: [], updated: [], removed: [], problems: [] };
  const total = ops.length;

  for (let i = 0; i < total; i++) {
    const op = ops[i];
    const current = ctx.current();
    const target = opTarget(op, current);

    if (target) ctx.setCursor(target);

    ctx.setAction(`${VERBS[op.op] ?? VERBS.mirror} ${describeOp(op, current)}`);
    await sleep(op.op === 'add' ? OP_DELAY_MS.add : OP_DELAY_MS.other);

    const applied = await applyOp(op, { current, live: i < total - 1, ctx, log });

    if (applied !== false) await sleep(OP_DELAY_MS.settle);
  }

  ctx.setAction('');

  if (ctx.isFollowing() && (log.added.length || log.removed.length)) ctx.viewport()?.frameAll();

  return summary(log);
}
