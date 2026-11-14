import { plural } from '../../electron/plural.mjs';
import { cutFiles, cutFilesZip, sheetParts } from '../sheet/cutFiles';
import { downloadBytes } from '../utils/downloadBytes';
import { errorMessage } from '../utils/errorMessage';
import { fileSafe } from './helpers';
import type { WorkspaceCore } from './useWorkspaceCore';

export function useCutFilesExport({
  parts,
  scene,
  showToast,
  viewportRef,
}: Pick<WorkspaceCore, 'parts' | 'scene' | 'showToast' | 'viewportRef'>) {
  'use memo';

  return async () => {
    const viewport = viewportRef.current;
    const ids = sheetParts(parts).map((p) => p.id);

    if (!viewport || !ids.length) return;

    try {
      const { files, skipped } = cutFiles(parts, await viewport.measureParts(ids));
      const folder = `${fileSafe(scene.sceneName)}-cut-files`;
      const left = skipped.length ? ` without ${plural(skipped.length, 'part')}` : '';

      if (!files.length) {
        showToast('Only flat parts can be cut from sheet', { tone: 'error' });

        return;
      }

      downloadBytes(cutFilesZip(folder, files), `${folder}.zip`, 'application/zip');
      showToast(`Exported ${plural(files.length, 'cut file')}${left}`);
    } catch (err) {
      showToast(errorMessage(err), { tone: 'error' });
    }
  };
}
