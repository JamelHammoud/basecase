import { cutFiles, hasSheetParts } from '../sheet/cutFiles';
import { cutFilesZip } from '../sheet/dxf';
import { downloadBytes } from '../utils/downloadBytes';
import { plural } from '../../electron/plural.mjs';
import { fileSafe } from './helpers';
import type { WorkspaceCore } from './useWorkspaceCore';

export function useCutFilesExport({
  parts,
  scene,
  showToast,
  viewportRef,
}: Pick<WorkspaceCore, 'parts' | 'scene' | 'showToast' | 'viewportRef'>) {
  'use memo';

  const exportCutFiles = () => {
    const viewport = viewportRef.current;

    if (!viewport) return;

    const { files, left } = cutFiles(parts, viewport.partTriangles);

    if (!files.length) return;

    downloadBytes(cutFilesZip(files), `${fileSafe(scene.sceneName)}-cut-files.zip`, 'application/zip');
    showToast(`Exported ${plural(files.length, 'cut file')}${left ? ` without ${plural(left, 'part')}` : ''}`);
  };

  return { exportCutFiles, canExportCutFiles: hasSheetParts(parts) };
}
