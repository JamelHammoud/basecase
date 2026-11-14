import { useRef } from 'react';
import { plural } from '../../electron/plural.mjs';
import { cutFiles } from '../sheet/cutFiles';
import { sheetOf } from '../sheet/sheetStock';
import { sheetProfileOf } from '../three/sheetProfile';
import type { ScenePart } from '../types/robotics';
import { downloadBytes } from '../utils/downloadBytes';
import { errorMessage } from '../utils/errorMessage';
import { zipFolder } from '../utils/zipFolder';
import { fileSafe } from './helpers';
import type { WorkspaceCore } from './useWorkspaceCore';

export const isCutPart = (p: ScenePart) => p.visible && !!sheetOf(p);

async function sceneCutFiles(parts: ScenePart[]) {
  const cut = parts.filter(isCutPart);
  const profiles = new Map(await Promise.all(cut.map(async (p) => [p.id, await sheetProfileOf(p)] as const)));

  return cutFiles(cut, (p) => profiles.get(p.id) ?? null);
}

export function useCutFilesExport({ parts, scene, showToast }: Pick<WorkspaceCore, 'parts' | 'scene' | 'showToast'>) {
  'use memo';

  const exportingRef = useRef(false);

  return async () => {
    if (exportingRef.current || !parts.some(isCutPart)) return;

    exportingRef.current = true;

    try {
      const { files, skipped } = await sceneCutFiles(parts);
      const count = Object.keys(files).length;
      const names = skipped.map((p) => p.name).join(', ');
      const folder = `${fileSafe(scene.sceneName)}-cut-files`;

      if (!count) return showToast(`Not flat: ${names}`, { tone: 'error' });

      downloadBytes(zipFolder(folder, files), `${folder}.zip`, 'application/zip');
      showToast(`Exported ${plural(count, 'cut file')}${names ? ` without ${names}` : ''}`);
    } catch (err) {
      showToast(`Couldn’t export cut files. ${errorMessage(err)}`, { tone: 'error' });
    } finally {
      exportingRef.current = false;
    }
  };
}
