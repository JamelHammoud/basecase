import type { ScenePart } from '../../types/robotics';
import { componentMeshesReady } from '../componentMeshes';
import type { ViewportContext } from './viewportContext';

type CaptureLayers = Pick<ViewportContext, 'layer' | 'world'>;

const readyLayers = (ctx: CaptureLayers) => Promise.all([ctx.layer.whenReady(), ctx.world.whenReady()]);

export async function readyMeshes(ctx: CaptureLayers, parts: ScenePart[]): Promise<string[]> {
  const missing = await componentMeshesReady(parts.flatMap((part) => part.componentId ?? []));

  await readyLayers(ctx);

  return missing;
}

export async function readyCapture<T>(ctx: CaptureLayers, complete: () => void, run: () => T | Promise<T>): Promise<T> {
  await readyLayers(ctx);
  complete();

  return run();
}
