import { useEffect, useRef } from 'react';
import { downloadBytes } from '../utils/downloadBytes';
import { errorMessage } from '../utils/errorMessage';
import { useLatestRef } from '../utils/useLatestRef';
import { fileSafe } from './helpers';
import { exportKit } from './kitExport';
import type { WorkspaceCore } from './useWorkspaceCore';

export function useKitExport(core: WorkspaceCore) {
  'use memo';

  const latest = useLatestRef(core);
  const active = useRef<AbortController | null>(null);

  useEffect(() => () => active.current?.abort(), []);

  return async () => {
    if (active.current) return;

    const abort = new AbortController();

    active.current = abort;
    core.showToast('Exporting kit…', {
      tone: 'progress',
      action: { label: 'Cancel', onClick: () => abort.abort() },
    });

    try {
      const bytes = await exportKit(core, { signal: abort.signal, current: () => latest.current });

      downloadBytes(bytes, `${fileSafe(core.scene.sceneName)}-kit.zip`, 'application/zip');
      core.showToast(`Exported ${core.scene.sceneName}`);
    } catch (error) {
      if (abort.signal.aborted) core.toasts.dismissToast();
      else core.showToast(`Couldn’t export the kit. ${errorMessage(error)}`, { tone: 'error' });
    } finally {
      active.current = null;
    }
  };
}
