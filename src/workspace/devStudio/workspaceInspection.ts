import { Vector3 } from 'three';
import { poseDeltas, type V3 } from '../../utils/kinematics';
import type { WorkspaceCore } from '../useWorkspaceCore';
import type { ArmWorkspace } from '../useArmWorkspace';
import type { Studio } from './types';

function previewPoint(core: WorkspaceCore, workspace: ArmWorkspace) {
  const { view, preview } = workspace;

  if (!view || !preview) return null;

  const delta = poseDeltas(
    core.posing.rig,
    { ...core.posing.pose, values: preview },
    core.parts.map((p) => p.id),
  ).get(view.part);
  const point = new Vector3(...view.point);

  if (delta) point.applyMatrix4(delta);

  return point.toArray();
}

function screenPoint(core: WorkspaceCore, point: V3) {
  const projected = core.viewportRef.current?.projectPoints([point])[0];
  const container = document.querySelector('.canvas-cursor')?.getBoundingClientRect();

  if (!projected || !container) return null;

  return { ...projected, x: projected.x + container.left, y: projected.y + container.top };
}

export function inspectWorkspace(studio: Studio) {
  const { core, actions } = studio();
  const workspace = actions.workspace;
  const { view } = workspace;
  const samples = view?.samples;

  if (!samples) return { count: 0, selected: null, point: null, screen: null, previewPoint: null };

  const index = view.selected ?? 0;
  const point = Array.from(samples.positions.slice(index * 3, index * 3 + 3)) as V3;

  return {
    metrics: {
      durationMs: samples.durationMs,
      checks: samples.checks,
      transferBytes: samples.positions.byteLength + samples.configurations.byteLength,
    },
    count: samples.positions.length / 3,
    selected: view.selected,
    point,
    screen: screenPoint(core, point),
    previewPoint: previewPoint(core, workspace),
  };
}
