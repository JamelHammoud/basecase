import { useEffect, useState } from 'react';
import type { WorkspaceCore } from './useWorkspaceCore';

const SETTLE_MS = 250;

export function useSheetThickness({ selection, viewportRef }: Pick<WorkspaceCore, 'selection' | 'viewportRef'>) {
  const part = selection.selectedPart;
  const [found, setFound] = useState<{ id: string; mm: number | null } | null>(null);

  useEffect(() => {
    if (!part || part.role !== 'solid') return;

    let live = true;
    const timer = setTimeout(() => {
      void viewportRef.current
        ?.sheetProfiles([part.id])
        .then((profiles) => live && setFound({ id: part.id, mm: profiles[part.id]?.thicknessMm ?? null }))
        .catch(() => live && setFound({ id: part.id, mm: null }));
    }, SETTLE_MS);

    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [part, viewportRef]);

  return found && found.id === part?.id ? found.mm : undefined;
}
