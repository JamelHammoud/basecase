import { useRef } from 'react';
import { downloadBytes } from '../utils/downloadBytes';
import { platformBridge } from '../utils/platformBridge';
import { fileSafe, plural } from './helpers';
import { stepJob } from './stepExport';
import type { WorkspaceCore } from './useWorkspaceCore';

export function useStepExport({ parts, scene, showToast }: Pick<WorkspaceCore, 'parts' | 'scene' | 'showToast'>) {
  'use memo';

  const exportingRef = useRef(false);

  return async () => {
    if (exportingRef.current || parts.length === 0) return;

    exportingRef.current = true;

    try {
      const { job, left } = await stepJob(parts, scene.sceneName);
      const { step, skipped } = await platformBridge.exportStep(job);

      downloadBytes(new TextEncoder().encode(step), `${fileSafe(scene.sceneName)}.step`, 'model/step');

      if (left + skipped > 0) showToast(`Exported STEP without ${plural(left + skipped, 'part', 'parts')}`);
    } catch (err) {
      showToast(String((err as Error)?.message ?? err), { tone: 'error' });
    } finally {
      exportingRef.current = false;
    }
  };
}
