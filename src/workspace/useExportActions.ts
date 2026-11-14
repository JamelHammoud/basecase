import { useRef } from 'react';
import { jobSpec } from '../print/job';
import { buildAIHandoffPayload } from '../utils/aiHandoff';
import { downloadBytes as download } from '../utils/downloadBytes';
import { platformBridge } from '../utils/platformBridge';
import { printReportOf } from '../utils/printReport';
import { encodeSceneFile, SCENE_FILE_EXTENSION, sharedScene } from '../utils/sceneFile';
import { scenePreview } from '../three/scenePreview';
import { goesOnPlate, isExportedSolid } from './exportable';
import { fileSafe } from './helpers';
import { isStepBody } from './stepExport';
import { useStepExport } from './useStepExport';
import type { WorkspaceCore } from './useWorkspaceCore';
import { IS_MAC } from '../utils/os';
import { useRobotPackageExport } from './useRobotPackageExport';
import { errorMessage } from '../utils/errorMessage';
import { plural } from '../../electron/plural.mjs';

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

export function useExportActions(core: WorkspaceCore) {
  'use memo';

  const { parts, scene, annotations, showToast, toasts, viewportRef, project, printer, posing, printing } = core;
  const sharingRef = useRef(false);
  const canExportParts = parts.some(isExportedSolid);
  const canExportPlates = parts.some(goesOnPlate);
  const exportStep = useStepExport({ parts, scene, showToast, toasts });
  const exportRobotPackage = useRobotPackageExport(core);

  const exportStl = async () => {
    const viewport = viewportRef.current;

    if (!viewport || !canExportParts) return;

    try {
      download(await viewport.exportStl(), `${fileSafe(scene.sceneName)}.stl`, 'model/stl');
      showToast('Exported STL');
    } catch (err) {
      showToast(errorMessage(err), { tone: 'error' });
    }
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
      showToast(`Couldn’t copy. ${errorMessage(err)}`, { tone: 'error' });
    }
  };

  const export3mf = async () => {
    const viewport = viewportRef.current;

    if (!viewport || !canExportPlates) return;

    const report = await printReportOf(parts, { project, printer }, viewport.printShapes);
    const spec = jobSpec(report.plan, printer, project);

    if (!spec.files.length) return;

    const { files } = await printing.plates.write(spec);
    const single = spec.files.length === 1;

    for (const file of spec.files) {
      const bytes = files[file.key];

      if (bytes) download(bytes, `${fileSafe(scene.sceneName)}${single ? '' : `-${file.key}`}.3mf`, 'model/3mf');
    }

    showToast(`Exported ${plural(report.plan.plates.length, 'plate')} as 3MF`);
  };

  const exportScene = async () => {
    try {
      const preview = await scenePreview(parts);
      const bytes = await encodeSceneFile(
        sharedScene({
          name: scene.sceneName,
          globalGoal: scene.globalGoal,
          parts,
          annotations: annotations.annotations,
          project,
          ...preview,
        }),
      );

      download(bytes, `${fileSafe(scene.sceneName)}.${SCENE_FILE_EXTENSION}`, 'application/gzip');
      showToast(`Exported ${scene.sceneName}`);
    } catch (err) {
      showToast(`Couldn’t export the scene. ${errorMessage(err)}`, { tone: 'error' });
    }
  };

  const airDrop = async () => {
    const viewport = viewportRef.current;

    if (!viewport || !canExportParts || sharingRef.current) return;

    const name = `${fileSafe(scene.sceneName)}.usdz`;

    sharingRef.current = true;
    showToast(IS_MAC ? 'Preparing AirDrop…' : 'Exporting USDZ…', { tone: 'progress' });

    try {
      await nextFrame();

      const bytes = await viewport.exportUsdz();

      if (!bytes.length) {
        toasts.dismissToast();

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
      showToast(`Couldn’t export USDZ. ${errorMessage(err)}`, { tone: 'error' });
    } finally {
      sharingRef.current = false;
    }
  };

  return {
    exportStl,
    exportStep,
    exportImage,
    export3mf,
    exportScene,
    airDrop,
    copyBrief,
    exportRobotPackage,
    canExportParts,
    canExportPlates,
    canExportStep: parts.some(isStepBody),
    canExportRobot: posing.hasRig,
  };
}

export type ExportActions = ReturnType<typeof useExportActions>;
