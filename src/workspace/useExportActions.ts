import { buildAIHandoffPayload, exportSceneToSTL } from '../utils/aiHandoff';
import { fileSafe } from './helpers';
import type { WorkspaceCore } from './useWorkspaceCore';

export function useExportActions({ parts, scene, annotations, showToast, viewportRef }: WorkspaceCore) {
  'use memo';

  const exportStl = () => {
    if (parts.length === 0) return;

    exportSceneToSTL(parts, `${fileSafe(scene.sceneName)}.stl`);
    showToast('Exported STL');
  };

  const exportImage = () => {
    const dataUrl = viewportRef.current?.captureScreenshot();

    if (!dataUrl) return;

    const a = document.createElement('a');

    a.href = dataUrl;
    a.download = `${fileSafe(scene.sceneName)}.png`;
    a.click();
    showToast('Exported image');
  };

  const copyBrief = async () => {
    const { markdown } = buildAIHandoffPayload(scene.sceneName, scene.globalGoal, parts, annotations.annotations);

    try {
      await navigator.clipboard.writeText(markdown);
      showToast('Copied as Markdown');
    } catch (err) {
      showToast(`Couldn’t copy. ${String(err)}`, { tone: 'error' });
    }
  };

  return { exportStl, exportImage, copyBrief, canExportStl: parts.length > 0 };
}

export type ExportActions = ReturnType<typeof useExportActions>;
