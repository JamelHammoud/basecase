import { useRef } from 'react';
import { downloadBytes } from '../utils/downloadBytes';
import { platformBridge } from '../utils/platformBridge';
import { fileSafe, plural } from './helpers';
import { isStepBody, stepJob } from './stepExport';
import type { WorkspaceCore } from './useWorkspaceCore';

export function useStepExport({
  parts,
  scene,
  showToast,
  toasts,
}: Pick<WorkspaceCore, 'parts' | 'scene' | 'showToast' | 'toasts'>) {
  'use memo';

  const exportingRef = useRef(false);

  return async () => {
    if (exportingRef.current || !parts.some(isStepBody)) return;

    exportingRef.current = true;
    showToast('Exporting STEP…', { tone: 'progress' });

    try {
      const { job, left } = await stepJob(parts, scene.sceneName);

      if (job.bodies.length === 0) {
        toasts.dismissToast();

        return;
      }

      const { step, skipped } = await platformBridge.exportStep(job);

      downloadBytes(new TextEncoder().encode(step), `${fileSafe(scene.sceneName)}.step`, 'model/step');

      if (left + skipped > 0) showToast(`Exported STEP without ${plural(left + skipped, 'part', 'parts')}`);
      else toasts.dismissToast();
    } catch (err) {
      showToast(String((err as Error)?.message ?? err), { tone: 'error' });
    } finally {
      exportingRef.current = false;
    }
  };
}
