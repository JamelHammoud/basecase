import { snapshotShapes, type SceneShapes } from '../analysis/sceneShapes';
import { solidObjects, partObjects } from './measurements';
import type { ViewportContext } from './viewportContext';
import { componentMeshesReady } from '../componentMeshes';
import { wiringIn } from '../analysis/analysisPool';
import type { WiringScene } from '../../wiring/netlist';

export function snapshotSolidsWith(ctx: ViewportContext, ids: string[]) {
  const solids = solidObjects(ctx, { visibleOnly: true });
  const known = new Set(solids.map((solid) => solid.id));

  return snapshotShapes([...solids, ...partObjects(ctx, ids).filter((object) => !known.has(object.id))]);
}

export async function wiringSnapshot(scene: WiringScene, snapshot: () => SceneShapes) {
  await componentMeshesReady(scene.parts.flatMap((part) => part.componentId ?? []));

  return wiringIn(snapshot(), scene);
}
