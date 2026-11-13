import { withJoints } from '../joints/declare';
import { mirrorAssembly } from '../mirror/mirrorAssembly';
import { lastPlaneView, rememberPlaneView, type PlaneView } from '../mirror/plane';
import { planeFor } from '../mirror/planeFor';
import { newId } from './helpers';
import type { WorkspaceCore } from './useWorkspaceCore';

export function useMirror({ docs, selection, setSelectedIds }: WorkspaceCore) {
  'use memo';

  const mirrorSelected = (view: PlaneView = lastPlaneView()) => {
    const parts = docs.partsRef.current;
    const selected = selection.selectedParts.filter((p) => parts.includes(p));

    if (selected.length === 0) return;

    rememberPlaneView(view);

    const { joints, skeleton } = docs.projectRef.current;
    const scene = { parts, joints, skeleton };
    const plane = planeFor(view, selected, scene);
    const result = mirrorAssembly(scene, { ids: selected.map((p) => p.id), plane, newId });

    docs.commitParts((prev) => [...prev, ...result.copies]);

    if (result.joints.length) docs.updateProjectNow((p) => withJoints(p, result.joints));

    setSelectedIds(result.copies.map((c) => c.id));
  };

  return { mirrorSelected };
}

export type Mirror = ReturnType<typeof useMirror>;
