import { useRef } from 'react';
import { downloadBytes } from '../utils/downloadBytes';
import { errorMessage } from '../utils/errorMessage';
import { cutFileJob } from './cutFileExport';
import { cutFilesZip } from './cutFilesClient';
import { fileSafe } from './helpers';
import type { WorkspaceCore } from './useWorkspaceCore';

export function useCutFileExport(core: WorkspaceCore) {
  'use memo';

  const exportingRef = useRef(false);
  const { parts, viewportRef, scene, showToast } = core;

  return async () => {
    const viewport = viewportRef.current;

    if (!viewport || exportingRef.current) return;

    exportingRef.current = true;

    try {
      await viewport.meshesReady();

      const job = await cutFileJob(parts, viewport.measureParts);

      if (!job.length) return;

      const bytes = await cutFilesZip(job);

      downloadBytes(bytes, `${fileSafe(scene.sceneName)}-cut-files.zip`, 'application/zip');
    } catch (error) {
      showToast(errorMessage(error), { tone: 'error' });
    } finally {
      exportingRef.current = false;
    }
  };
}
