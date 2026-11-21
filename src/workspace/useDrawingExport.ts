import { useEffect, useRef, useState } from 'react';
import { downloadBytes } from '../utils/downloadBytes';
import { errorMessage } from '../utils/errorMessage';
import { useLatestRef } from '../utils/useLatestRef';
import type { DrawingOptions } from '../sheet/drawingTypes';
import { drawingExport, type DrawingSelection } from './drawingExport';
import { fileSafe } from './helpers';
import type { WorkspaceCore } from './useWorkspaceCore';

export function useDrawingExport(core: WorkspaceCore, kit: (options: DrawingOptions) => Promise<void>) {
  'use memo';

  const [mode, setMode] = useState<'drawings' | 'kit'>('drawings');
  const [isOpen, setOpen] = useState(false);
  const latest = useLatestRef(core);
  const active = useRef<AbortController | null>(null);

  useEffect(
    () => () => active.current?.abort(),
    [core.parts, core.project, core.scene.sceneId, core.scene.sceneName, core.active],
  );

  const run = async (selection: DrawingSelection) => {
    setOpen(false);

    if (mode === 'kit') {
      await kit(selection.options);

      return;
    }

    if (active.current) return;

    const abort = new AbortController();

    active.current = abort;
    core.showToast('Exporting drawings…', {
      tone: 'progress',
      action: { label: 'Cancel', onClick: () => abort.abort() },
    });

    try {
      const { bytes } = await drawingExport(core, selection, { signal: abort.signal, current: () => latest.current });

      downloadBytes(bytes, `${fileSafe(core.scene.sceneName)}-drawings.zip`, 'application/zip');
      core.showToast(`Exported ${core.scene.sceneName}`);
    } catch (error) {
      if (abort.signal.aborted) core.toasts.dismissToast();
      else core.showToast(errorMessage(error), { tone: 'error' });
    } finally {
      active.current = null;
    }
  };

  const open = (next: 'drawings' | 'kit') => {
    setMode(next);
    setOpen(true);
  };

  return {
    isOpen,
    mode,
    openDrawings: () => open('drawings'),
    openKit: () => open('kit'),
    close: () => setOpen(false),
    run,
  };
}
