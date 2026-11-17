import { useEffect, useRef } from 'react';
import { downloadBytes } from '../utils/downloadBytes';
import { errorMessage } from '../utils/errorMessage';
import { useLatestRef } from '../utils/useLatestRef';
import { fileSafe } from './helpers';
import { schematicExport } from './schematicExport';
import type { WorkspaceCore } from './useWorkspaceCore';

export function useSchematicExport(core: WorkspaceCore) {
  'use memo';

  const latest = useLatestRef(core);
  const active = useRef<AbortController | null>(null);

  useEffect(() => () => active.current?.abort(), []);

  return async () => {
    if (active.current) return;

    const abort = new AbortController();

    active.current = abort;
    core.showToast('Exporting schematic…', {
      tone: 'progress',
      action: { label: 'Cancel', onClick: () => abort.abort() },
    });

    try {
      const result = await schematicExport(core, { signal: abort.signal, current: () => latest.current });
      const deliveryStart = performance.now();

      downloadBytes(result.bytes, `${fileSafe(core.scene.sceneName)}-schematic.zip`, 'application/zip');
      performance.measure('schematic:delivery', { start: deliveryStart });

      const board = core.project.electronicsBoard;

      if ('validation' in result && result.validation && board?.routed) {
        const { key, version, issues, report, metrics } = result.validation;

        const refreshed = {
          ...board,
          routed: { ...board.routed, evidence: { key, version, issues, report, metrics } },
        };

        core.docs.updateProjectNow((project) =>
          project.electronicsBoard === board ? { ...project, electronicsBoard: refreshed } : project,
        );
      }

      core.showToast(`Exported ${core.scene.sceneName}`);
    } catch (error) {
      if (abort.signal.aborted) core.toasts.dismissToast();
      else core.showToast(errorMessage(error), { tone: 'error' });
    } finally {
      active.current = null;
    }
  };
}
