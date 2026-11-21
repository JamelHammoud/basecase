import type { ScenePart } from '../../types/robotics';
import { componentMeshesReady } from '../componentMeshes';
import type { ViewportContext } from './viewportContext';

export async function readyMeshes(ctx: ViewportContext, parts: ScenePart[]): Promise<string[]> {
  const missing = await componentMeshesReady(parts.flatMap((part) => part.componentId ?? []));

  await ctx.layer.whenReady();

  return missing;
}

export async function readyCapture<T>(
  ctx: ViewportContext,
  complete: () => void,
  run: () => T | Promise<T>,
): Promise<T> {
  await ctx.layer.whenReady();
  complete();

  return run();
}
