import { useRef } from 'react';
import { jobSpec } from '../print/job';
import { buildAIHandoffPayload, exportSceneToSTL } from '../utils/aiHandoff';
import { platformBridge } from '../utils/platformBridge';
import { printReportOf } from '../utils/printReport';
import { fileSafe } from './helpers';
import type { WorkspaceCore } from './useWorkspaceCore';

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

function download(bytes: Uint8Array, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement('a');

  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function useExportActions({
  parts,
  scene,
  annotations,
  showToast,
  toasts,
  viewportRef,
  project,
  printer,
}: WorkspaceCore) {
  'use memo';

  const sharingRef = useRef(false);

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

  const export3mf = async () => {
    const viewport = viewportRef.current;

    if (!viewport) return;

    const report = await printReportOf(parts, { project, printer }, viewport.printShapes);
    const spec = jobSpec(report.plan, printer, project);

    if (!spec.files.length) {
      showToast('No printed parts to export', { tone: 'error' });

      return;
    }

    const files = await viewport.printThreeMf(spec.files, spec.plateSize);
    const single = spec.files.length === 1;

    for (const file of spec.files) {
      const bytes = files[file.key];

      if (bytes) download(bytes, `${fileSafe(scene.sceneName)}${single ? '' : `-${file.key}`}.3mf`, 'model/3mf');
    }

    showToast(`Exported ${report.plan.plates.length} ${report.plan.plates.length === 1 ? 'plate' : 'plates'} as 3MF`);
  };

  const airDrop = async () => {
    const viewport = viewportRef.current;

    if (!viewport || parts.length === 0 || sharingRef.current) return;

    const name = `${fileSafe(scene.sceneName)}.usdz`;

    sharingRef.current = true;
    showToast('Preparing AirDrop…', { tone: 'progress' });

    try {
      await nextFrame();

      const bytes = await viewport.exportUsdz();

      if (!bytes.length) {
        showToast('No solid parts to share', { tone: 'error' });

        return;
      }

      const shared = await platformBridge.shareFile(name, bytes);

      if (shared === 'airdrop' || shared === 'shared') {
        toasts.dismissToast();

        return;
      }

      if (!shared) download(bytes, name, 'model/vnd.usdz+zip');

      showToast(`Exported ${scene.sceneName} as USDZ`);
    } catch (err) {
      showToast(`Couldn’t export USDZ. ${String(err)}`, { tone: 'error' });
    } finally {
      sharingRef.current = false;
    }
  };

  return { exportStl, exportImage, export3mf, airDrop, copyBrief, canExportStl: parts.length > 0 };
}

export type ExportActions = ReturnType<typeof useExportActions>;
