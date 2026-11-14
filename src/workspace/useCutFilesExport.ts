import { useRef } from 'react';
import { plural } from '../../electron/plural.mjs';
import { cutFileList } from '../sheet/cutFiles';
import { sheetOf } from '../sheet/sheetStock';
import type { ScenePart } from '../types/robotics';
import { downloadBytes } from '../utils/downloadBytes';
import { errorMessage } from '../utils/errorMessage';
import { fileSafe } from './helpers';
import type { WorkspaceCore } from './useWorkspaceCore';

export const isCutPart = (p: ScenePart) => p.visible && !!sheetOf(p);

type CutFilesSource = Pick<WorkspaceCore, 'parts' | 'scene' | 'showToast' | 'viewportRef'>;

export function useCutFilesExport({ parts, scene, showToast, viewportRef }: CutFilesSource) {
  'use memo';

  const exportingRef = useRef(false);

  return async () => {
    const viewport = viewportRef.current;

    if (exportingRef.current || !viewport || !parts.some(isCutPart)) return;

    exportingRef.current = true;

    try {
      const folder = `${fileSafe(scene.sceneName)}-cut-files`;
      const { zip, count, skipped } = await viewport.exportCutFiles({ folder, files: cutFileList(parts) });
      const names = skipped.map((id) => parts.find((p) => p.id === id)?.name ?? id).join(', ');

      if (!zip) return showToast(`Nothing flat to cut. Choose a printed material for ${names}.`, { tone: 'error' });

      downloadBytes(zip, `${folder}.zip`, 'application/zip');
      showToast(`Exported ${plural(count, 'cut file')}${names ? ` without ${names}` : ''}`);
    } catch (err) {
      showToast(`Couldn’t export cut files. ${errorMessage(err)}`, { tone: 'error' });
    } finally {
      exportingRef.current = false;
    }
  };
}
