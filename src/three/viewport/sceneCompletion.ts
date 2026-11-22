import { componentMeshesReady } from '../componentMeshes';
import type { ViewportContext } from './viewportContext';
import type { ScenePart } from '../../types/robotics';
import { prepareLocalTriangles } from './localTriangleCache';

const active = new WeakMap<ViewportContext, { parts: ScenePart[]; world?: ScenePart[]; result: Promise<string[]> }>();
const sameParts = (before: ScenePart[] = [], after: ScenePart[] = []) =>
  before === after || (before.length === after.length && before.every((part, index) => part === after[index]));

const MAX_RESTARTS = 5;

const isAbort = (error: unknown) => error instanceof Error && error.name === 'AbortError';

export async function prepareCurrentViewport(ctx: ViewportContext, built: () => void): Promise<string[]> {
  for (let restarts = 0; ; restarts++) {
    try {
      return await prepareViewport(ctx, built);
    } catch (error) {
      if (restarts >= MAX_RESTARTS || !isAbort(error) || ctx.stage.renderer.getContext().isContextLost()) throw error;

      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
}

export function prepareViewport(ctx: ViewportContext, built: () => void): Promise<string[]> {
  const parts = ctx.props().parts;
  const world = ctx.props().worldParts;
  const pending = active.get(ctx);

  if (pending && sameParts(pending.parts, parts) && sameParts(pending.world, world)) return pending.result;

  const result = prepareScene(ctx, built, parts).finally(() => {
    if (active.get(ctx)?.result === result) active.delete(ctx);
  });

  active.set(ctx, { parts, world, result });

  return result;
}

async function prepareScene(ctx: ViewportContext, built: () => void, parts: ScenePart[]): Promise<string[]> {
  const world = ctx.props().worldParts;
  const isCurrent = () =>
    sameParts(parts, ctx.props().parts) &&
    sameParts(world, ctx.props().worldParts) &&
    !ctx.stage.renderer.getContext().isContextLost();
  const current = () => {
    if (!isCurrent()) throw AbortSignal.abort().reason;
  };

  current();

  const failed = await componentMeshesReady(parts.flatMap((part) => part.componentId ?? []));

  current();
  ctx.layer.queueLoadedComponents();

  built();
  await Promise.all([ctx.layer.whenReady(), ctx.world.whenReady()]);
  current();
  ctx.loop.finishSpawns();
  await prepareLocalTriangles(
    ctx.layer.objects().map(([, object]) => object),
    isCurrent,
  );
  current();

  return failed;
}

export function completeViewport(ctx: ViewportContext, ids?: string[]) {
  ctx.loop.finishSpawns();
  ctx.layer.queueLoadedComponents();

  if (ctx.layer.pendingGeometry(ids ? new Set(ids) : undefined)) throw AbortSignal.abort().reason;
}
