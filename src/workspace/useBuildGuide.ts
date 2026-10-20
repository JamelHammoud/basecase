import { useRef, useState, type RefObject } from 'react';
import { generateGuide, type GeneratedGuide, type GuideProgress } from '../guide/generateGuide';
import { guideFingerprint } from '../guide/guideFingerprint';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import { platformBridge } from '../utils/platformBridge';
import type { ShowToast } from './types';

interface BuildGuideOptions {
  sceneName: string;
  parts: ScenePart[];
  project: ProjectSettings;
  partsRef: RefObject<ScenePart[]>;
  projectRef: RefObject<ProjectSettings>;
  updateProjectNow: (patch: (p: ProjectSettings) => ProjectSettings) => void;
  showToast: ShowToast;
}

function openHtml(html: string) {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));

  window.open(url, '_blank');
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function useBuildGuide(options: BuildGuideOptions) {
  const { sceneName, parts, project, partsRef, projectRef, updateProjectNow, showToast } = options;
  const [progress, setProgress] = useState<GuideProgress | null>(null);
  const runRef = useRef<Promise<GeneratedGuide | null> | null>(null);
  const cancelledRef = useRef(false);
  const record = project.buildGuide;
  const stale = !!record && record.fingerprint !== guideFingerprint(sceneName, parts, project);

  const open = async () => {
    const id = projectRef.current.buildGuide?.id;

    if (id && !(await platformBridge.openGuide(id))) showToast('Regenerate the guide to open it', { tone: 'error' });
  };

  const reveal = async () => {
    const id = projectRef.current.buildGuide?.id;

    if (id && !(await platformBridge.revealGuide(id))) showToast('Regenerate the guide to show it', { tone: 'error' });
  };

  const finish = (result: GeneratedGuide | null) => {
    if (!result) return result;

    updateProjectNow((p) => ({ ...p, buildGuide: result.record }));

    if (result.saved) showToast(`Made ${sceneName} build guide`, { action: { label: 'Open', onClick: open } });
    else openHtml(result.html);

    return result;
  };

  const generate = (): Promise<GeneratedGuide | null> => {
    if (runRef.current) return runRef.current;

    cancelledRef.current = false;
    setProgress({ share: 0, label: 'Measuring parts' });

    const run = generateGuide({
      title: sceneName,
      parts: partsRef.current,
      project: projectRef.current,
      onProgress: setProgress,
      isCancelled: () => cancelledRef.current,
    })
      .then(finish)
      .catch((err: unknown) => {
        console.error('[guide] failed', (err as Error)?.stack ?? err);
        showToast(`Couldn’t make the guide. ${String((err as Error)?.message ?? err)}`, { tone: 'error' });

        return null;
      })
      .finally(() => {
        runRef.current = null;
        setProgress(null);
      });

    runRef.current = run;

    return run;
  };

  const cancel = () => {
    cancelledRef.current = true;
  };

  return { record, stale, progress, generate, cancel, open, reveal };
}

export type BuildGuide = ReturnType<typeof useBuildGuide>;
