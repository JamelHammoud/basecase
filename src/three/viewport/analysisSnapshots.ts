import { snapshotShapes } from '../analysis/sceneShapes';
import { solidObjects, partObjects } from './measurements';
import type { ViewportContext } from './viewportContext';
import { componentMeshError, componentMeshesReady } from '../componentMeshes';
import { wiringIn } from '../analysis/analysisPool';
import type { WiringScene } from '../../wiring/netlist';
import type { ScenePart } from '../../types/robotics';

export function snapshotSolidsWith(ctx: ViewportContext, ids: string[]) {
  const solids = solidObjects(ctx, { visibleOnly: true });
  const known = new Set(solids.map((solid) => solid.id));

  return snapshotShapes([...solids, ...partObjects(ctx, ids).filter((object) => !known.has(object.id))]);
}

function sameSceneParts(before: ScenePart[], after: ScenePart[]): boolean {
  const solids = (parts: ScenePart[]) => parts.filter((part) => part.role === 'solid' && part.kind !== 'image_plane');
  const expected = before.filter((part) => part.kind !== 'image_plane');
  const byId = new Map(after.map((part) => [part.id, part]));

  return solids(before).length === solids(after).length && expected.every((part) => byId.get(part.id) === part);
}

export async function wiringSnapshot(scene: WiringScene, ctx: ViewportContext, complete: () => void) {
  const failed = await componentMeshesReady(scene.parts.flatMap((part) => part.componentId ?? []));

  if (failed.length) throw new Error(failed.map((id) => componentMeshError(id) ?? id).join('\n'));

  if (!sameSceneParts(scene.parts, ctx.props().parts)) throw new Error('Open the scene to measure cable routes.');

  complete();

  const snapshot = ctx.layer.withRest(() => snapshotShapes(solidObjects(ctx, { visibleOnly: false })), ctx.applyPose);

  return wiringIn(snapshot, scene);
}
