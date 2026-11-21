import type { WorkspaceCore } from './useWorkspaceCore';
import type { Viewport3DHandle } from '../three/viewport/types';
import { compositionParts } from '../three/composition/scene';

export function compositionPose(viewport: Viewport3DHandle | null, parts: WorkspaceCore['parts']) {
  const matrices = viewport?.renderPose() ?? {};

  return Object.fromEntries(
    compositionParts(parts).flatMap((part) => (matrices[part.id] ? [[part.id, matrices[part.id]]] : [])),
  );
}

export function compositionSource(core: WorkspaceCore) {
  return {
    parts: core.parts,
    pose: core.project.pose,
    joints: core.project.joints,
    rendering: core.project.rendering,
    scene: core.scene.sceneId,
    matrices: compositionPose(core.viewportRef.current, core.parts),
  };
}

export type CompositionSource = ReturnType<typeof compositionSource>;

export function sameRenderPose(a: Record<string, number[]>, b: Record<string, number[]>): boolean {
  const ids = Object.keys(a);

  return (
    ids.length === Object.keys(b).length &&
    ids.every((id) => a[id].length === b[id]?.length && a[id].every((value, i) => value === b[id][i]))
  );
}

export function compositionMatches(core: WorkspaceCore, source: CompositionSource): boolean {
  return (
    core.active &&
    core.parts === source.parts &&
    core.project.pose === source.pose &&
    core.project.joints === source.joints &&
    core.project.rendering === source.rendering &&
    core.scene.sceneId === source.scene
  );
}

export function compositionSourceCurrent(core: WorkspaceCore, source: CompositionSource): boolean {
  return (
    compositionMatches({ ...core, parts: core.docs.partsRef.current, project: core.docs.projectRef.current }, source) &&
    sameRenderPose(source.matrices, compositionPose(core.viewportRef.current, source.parts))
  );
}
