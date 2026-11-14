import { useEffect, useState } from 'react';
import { detectSheet, MAX_THICKNESS_MM, type SheetProfile } from '../sheet/detect';
import type { ScenePart } from '../types/robotics';
import { isPrinted, sheetPart } from '../utils/bom';
import type { WorkspaceCore } from './useWorkspaceCore';

const mayBeSheet = (p: ScenePart) =>
  (isPrinted(p) || !!sheetPart(p)) &&
  Math.min(p.dimensions.width, p.dimensions.height, p.dimensions.depth) <= MAX_THICKNESS_MM;

export function useSheetFit({ selection, viewportRef }: Pick<WorkspaceCore, 'selection' | 'viewportRef'>) {
  const part = selection.selectedPart;
  const [fit, setFit] = useState<{ part: ScenePart; profile: SheetProfile | null } | null>(null);

  useEffect(() => {
    const viewport = viewportRef.current;

    if (!part || !viewport || !mayBeSheet(part)) return;

    let live = true;

    void viewport.meshesReady().then(() => {
      const triangles = viewport.partTriangles(part.id);

      if (live) setFit({ part, profile: triangles ? detectSheet(triangles) : null });
    });

    return () => {
      live = false;
    };
  }, [part, viewportRef]);

  return fit?.part === part ? fit.profile : null;
}
