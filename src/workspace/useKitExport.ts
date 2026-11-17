import type { DrawingOptions } from '../sheet/drawingTypes';
import { useEffect, useRef } from 'react';
import { downloadBytes } from '../utils/downloadBytes';
import { errorMessage } from '../utils/errorMessage';
import { useLatestRef } from '../utils/useLatestRef';
import { fileSafe } from './helpers';
import { exportKitResult } from './kitExport';
import type { WorkspaceCore } from './useWorkspaceCore';

export function useKitExport(core: WorkspaceCore) {
  'use memo';

  const latest = useLatestRef(core);
  const active = useRef<AbortController | null>(null);

  useEffect(
    () => () => active.current?.abort(),
    [core.parts, core.project, core.scene.sceneId, core.scene.sceneName, core.active],
  );

  return async (drawingOptions?: DrawingOptions) => {
    if (active.current) return;

    const abort = new AbortController();

    active.current = abort;
    core.showToast('Exporting kit…', {
      tone: 'progress',
      action: { label: 'Cancel', onClick: () => abort.abort() },
    });

    try {
      const result = await exportKitResult(core, {
        signal: abort.signal,
        current: () => latest.current,
        drawingOptions,
      });

      downloadBytes(result.bytes, `${fileSafe(core.scene.sceneName)}-kit.zip`, 'application/zip');
      core.showToast(
        result.electrical?.fabrication === 'missing'
          ? 'Exported kit without PCB fabrication. Read electrical/requirements.json.'
          : `Exported ${core.scene.sceneName}`,
      );
    } catch (error) {
      if (abort.signal.aborted) core.toasts.dismissToast();
      else core.showToast(errorMessage(error), { tone: 'error' });
    } finally {
      active.current = null;
    }
  };
}
