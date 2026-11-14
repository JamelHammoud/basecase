import { plural } from '../../electron/plural.mjs';
import { cutFilesZip, type CutFile } from '../sheet/dxf';
import { cutSheet } from '../utils/bom';
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

  const sheetParts = parts.filter((p) => cutSheet(p));

  const exportCutFiles = async () => {
    const viewport = viewportRef.current;

    if (!viewport || !sheetParts.length) return;

    try {
      const profiles = await viewport.sheetProfiles(sheetParts.map((p) => p.id));
      const files = sheetParts.flatMap((p): CutFile[] => {
        const profile = profiles[p.id];

        return profile ? [{ name: p.name, sheet: cutSheet(p)!, profile }] : [];
      });
      const left = sheetParts.length - files.length;

      if (!files.length) {
        showToast('No flat parts to export', { tone: 'error' });

        return;
      }

      downloadBytes(cutFilesZip(files), `${fileSafe(scene.sceneName)}-cut-files.zip`, 'application/zip');

      if (left) showToast(`Exported cut files without ${plural(left, 'part')}`);
    } catch (err) {
      showToast(errorMessage(err), { tone: 'error' });
    }
  };

  return { exportCutFiles, canExportCutFiles: sheetParts.length > 0 };
}
