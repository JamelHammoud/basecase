import { useRef } from 'react';
import { downloadBytes } from '../utils/downloadBytes';
import { robotPackageZip } from './robotPackageExport';
import type { WorkspaceCore } from './useWorkspaceCore';

export function useRobotPackageExport(core: WorkspaceCore) {
  'use memo';

  const { showToast, toasts } = core;
  const packingRef = useRef(false);

  return async () => {
    if (packingRef.current) return;

    packingRef.current = true;
    showToast('Exporting robot package…', { tone: 'progress' });

    try {
      const made = await robotPackageZip(core);

      if (!made) {
        toasts.dismissToast();

        return;
      }

      downloadBytes(made.zip, `${made.name}.zip`, 'application/zip');
      showToast(`Exported ${made.name}`);
    } catch (err) {
      showToast(`Couldn’t export the robot package. ${String(err)}`, { tone: 'error' });
    } finally {
      packingRef.current = false;
    }
  };
}
