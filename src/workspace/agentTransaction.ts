import type { ScenePart } from '../types/robotics';
import { editWithOperands, surfaceOperands } from '../booleans/operands';
import type { AgentOpsContext } from './applyAgentOps';
import { isolatedGeometryWorker } from '../three/geometryWorker';
import { prepareAgentPart, type AgentPartJob } from '../agent/prepareAgentPart';

export const AGENT_EDIT_CHANGED = 'The part changed. Run the edit again.';

export function assertAgentCurrent(ctx: Pick<AgentOpsContext, 'signal' | 'isCurrent'>) {
  ctx.signal?.throwIfAborted();

  if (ctx.isCurrent && !ctx.isCurrent()) throw AbortSignal.abort().reason;
}

function replacements(before: ScenePart[], after: ScenePart[]) {
  const original = new Map(before.map((part) => [part.id, part]));
  const prepared = new Map(after.map((part) => [part.id, part]));
  const changed = new Set(
    [...before, ...after].filter((part) => original.get(part.id) !== prepared.get(part.id)).map((part) => part.id),
  );

  return { original, prepared, changed };
}

function sameField(a: unknown, b: unknown): boolean {
  if (a === b) return true;

  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;

  const entries = Object.entries(a);
  const other = b as Record<string, unknown>;

  return entries.length === Object.keys(b).length && entries.every(([key, value]) => value === other[key]);
}

function mergePart(before: ScenePart | undefined, after: ScenePart | undefined, current: ScenePart | undefined) {
  if (before === current) return after;

  if (!before || !after || !current) throw new Error(AGENT_EDIT_CHANGED);

  const keys = new Set([...Object.keys(before), ...Object.keys(after)]) as Set<keyof ScenePart>;
  const patch: Record<string, unknown> = {};

  for (const key of keys) {
    if (sameField(before[key], after[key])) continue;

    if (!sameField(before[key], current[key]) && !sameField(after[key], current[key]))
      throw new Error(AGENT_EDIT_CHANGED);

    patch[key] = after[key];
  }

  return { ...current, ...patch };
}

export function mergeAgentParts(before: ScenePart[], prepared: ScenePart[], latest: ScenePart[]): ScenePart[] {
  const delta = replacements(before, prepared);
  const current = new Map(latest.map((part) => [part.id, part]));
  const merged = new Map<string, ScenePart | undefined>();

  for (const id of delta.changed)
    merged.set(id, mergePart(delta.original.get(id), delta.prepared.get(id), current.get(id)));

  const parts = latest.flatMap((part) => (delta.changed.has(part.id) ? (merged.get(part.id) ?? []) : part));

  for (const part of prepared) {
    if (!delta.original.has(part.id)) parts.push(part);
  }

  return delta.changed.size ? parts : latest;
}

export async function agentTransaction(ctx: AgentOpsContext, prepare: (staged: AgentOpsContext) => Promise<string>) {
  assertAgentCurrent(ctx);

  const worker = isolatedGeometryWorker();
  const dispose = () => worker.dispose();

  ctx.signal?.addEventListener('abort', dispose, { once: true });

  try {
    return await commitTransaction(ctx, (staged) =>
      prepare({
        ...staged,
        preparePart: (job: AgentPartJob) =>
          typeof Worker === 'undefined' ? Promise.resolve(prepareAgentPart(job)) : worker.call('agentPart', job),
      }),
    );
  } finally {
    ctx.signal?.removeEventListener('abort', dispose);
    dispose();
  }
}

async function commitTransaction(ctx: AgentOpsContext, prepare: (staged: AgentOpsContext) => Promise<string>) {
  const before = ctx.current();
  let prepared = before;
  const touched = new Set<string>();
  const result = await prepare({
    ...ctx,
    current: () => prepared,
    latest: ctx.current,
    original: () => before,
    commitParts: (edit) => {
      prepared = editWithOperands(prepared, edit);
    },
    touch: (id) => touched.add(id),
    isFollowing: () => false,
  });

  assertAgentCurrent(ctx);

  const latest = ctx.current();
  const merged = mergeAgentParts(before, prepared, latest);

  if (merged === latest) return result;

  const originals = new Map(surfaceOperands(latest).map((part) => [part.id, part]));

  ctx.commitParts(() => surfaceOperands(merged));

  if (ctx.current() === latest) throw new Error(AGENT_EDIT_CHANGED);

  for (const id of touched) ctx.touch(id, originals.get(id) ?? null);

  const oldIds = new Set(surfaceOperands(before).map((part) => part.id));
  const added = surfaceOperands(merged)
    .filter((part) => !oldIds.has(part.id))
    .map((part) => part.id);

  if (added.length) ctx.viewport()?.animateSpawn(added);

  if (ctx.isFollowing() && before.length !== merged.length) ctx.viewport()?.frameAll();

  return result;
}
