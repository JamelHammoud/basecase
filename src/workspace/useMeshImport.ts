import { useEffect, useRef } from 'react';
import { useLatestRef } from '../utils/useLatestRef';
import { errorMessage } from '../utils/errorMessage';
import { plural } from '../../electron/plural.mjs';
import type { ScenePart } from '../types/robotics';
import { cadPartsFromFile } from './cadImport';
import { couldntImport, isCadFileName } from './importRoute';
import { meshPartsFromFile } from './meshImport';
import { newId } from './helpers';
import type { Vec3 } from './types';
import type { WorkspaceCore } from './useWorkspaceCore';

const MESH_STEP = 40;

const partsFromFile = async (file: File, at: Vec3 | null, resources: File[]): Promise<ScenePart[]> =>
  isCadFileName(file.name) ? cadPartsFromFile({ file, at, newId }) : meshPartsFromFile({ file, newId, at, resources });

export function useMeshImport(core: WorkspaceCore) {
  const latest = useLatestRef(core);
  const pending = useRef(new Set<AbortController>());
  const mounted = useRef(true);

  useEffect(() => {
    const imports = pending.current;

    mounted.current = true;

    return () => {
      mounted.current = false;

      for (const controller of imports) controller.abort();
    };
  }, [core.scene.sceneId]);

  const isCurrent = (sceneId: string) => mounted.current && latest.current.scene.sceneId === sceneId;

  const importMeshes = async (files: File[], at?: Vec3 | null, resources: File[] = []) => {
    if (!files.length || !isCurrent(core.scene.sceneId)) return;

    const controller = new AbortController();
    const sceneId = core.scene.sceneId;
    const label = files.length === 1 ? files[0].name : plural(files.length, 'mesh', 'meshes');

    pending.current.add(controller);

    const toastId = core.toasts.showToast(`Importing ${label}…`, { tone: 'progress' });
    const dismiss = () => core.toasts.dismissToast(toastId);

    controller.signal.addEventListener('abort', dismiss, { once: true });

    try {
      const results = await Promise.allSettled(
        files.map((file, i) => partsFromFile(file, at ? [at[0] + i * MESH_STEP, at[1], at[2]] : null, resources)),
      );

      if (controller.signal.aborted || !isCurrent(sceneId)) {
        dismiss();

        return;
      }

      const parts = results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
      const failed = files.filter((_, i) => results[i].status === 'rejected');

      if (parts.length > 0) {
        core.docs.commitParts((previous) => [...previous, ...parts]);
        core.setSelectedIds(parts.map((part) => part.id));
        core.tool.setTransformMode('translate');
      }

      if (failed.length > 0) {
        const rejection = results.find((result) => result.status === 'rejected');
        const reason = rejection?.status === 'rejected' ? errorMessage(rejection.reason) : '';

        core.showToast(`${couldntImport(failed)}${reason ? `. ${reason}` : ''}`, { tone: 'error' });

        return;
      }

      dismiss();
    } finally {
      controller.signal.removeEventListener('abort', dismiss);
      pending.current.delete(controller);
    }
  };

  return { importMeshes };
}
