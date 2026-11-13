import { useEffect, useRef, useState, type RefObject } from 'react';
import { generateGuide, type GeneratedGuide, type GuideProgress } from '../guide/generateGuide';
import { guideFingerprint } from '../guide/guideFingerprint';
import { isBuilt } from '../guide/guidePlan';
import type { GuidePlan } from '../guide/guideTypes';
import { guidePagesKey, loadGuidePages, seedGuidePages, type GuidePages } from '../guide/viewer/guidePages';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import { platformBridge } from '../utils/platformBridge';
import type { ShowToast } from './types';
import { provenOrderOf } from '../assembly/provenOrder';
import type { Viewport3DHandle } from '../components/Viewport3D';
import { errorMessage } from '../utils/errorMessage';

interface BuildGuideOptions {
  sceneName: string;
  parts: ScenePart[];
  project: ProjectSettings;
  partsRef: RefObject<ScenePart[]>;
  projectRef: RefObject<ProjectSettings>;
  updateProjectNow: (patch: (p: ProjectSettings) => ProjectSettings) => void;
  showToast: ShowToast;
  viewportRef: RefObject<Viewport3DHandle | null>;
}

const ORDER_BUDGET_MS = 20000;

async function buildOrder(viewport: Viewport3DHandle | null, parts: ScenePart[]) {
  if (!viewport) return null;

  return provenOrderOf(parts, await viewport.assembly({ serviceable: [], budgetMs: ORDER_BUDGET_MS }));
}

export type GuideRunProgress = GuideProgress & { secondsLeft?: number };

const ESTIMATE_AFTER_SHARE = 0.2;
const ESTIMATE_AFTER_MS = 3000;

const clock = () => performance.now();

function withEstimate(progress: GuideProgress, startedAt: number): GuideRunProgress {
  const elapsed = clock() - startedAt;

  if (progress.share < ESTIMATE_AFTER_SHARE || elapsed < ESTIMATE_AFTER_MS) return progress;

  return { ...progress, secondsLeft: ((elapsed / progress.share) * (1 - progress.share)) / 1000 };
}

export function useBuildGuide(options: BuildGuideOptions) {
  const { sceneName, parts, project, partsRef, projectRef, updateProjectNow, showToast, viewportRef } = options;
  const [progress, setProgress] = useState<GuideRunProgress | null>(null);
  const [cover, setCover] = useState<string | null>(null);
  const [viewing, setViewing] = useState<GuidePages | null>(null);
  const runRef = useRef<Promise<GeneratedGuide | null> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const planRef = useRef<{ fingerprint: string; plan: GuidePlan } | null>(null);
  const record = project.buildGuide;
  const fingerprint = guideFingerprint(sceneName, parts, project);
  const stale = !!record && record.fingerprint !== fingerprint;
  const missing = !record && parts.some(isBuilt);

  useEffect(() => () => abortRef.current?.abort(), []);

  const withPdf = async (act: (id: string) => Promise<boolean>, failure: string) => {
    const id = projectRef.current.buildGuide?.id;

    if (!id) return;

    const ready = (await platformBridge.guideExists(id)) ? id : (await generate({ quiet: true }))?.record.id;

    if (ready && !(await act(ready))) showToast(failure, { tone: 'error' });
  };

  const openPdf = () => withPdf(platformBridge.openGuide, 'Couldn’t open the PDF');

  const show = async (current: { id: string; generatedAt: string }) => {
    const pages = await loadGuidePages(current.id, current.generatedAt);

    if (pages) setViewing(pages);

    return !!pages;
  };

  const open = async () => {
    const current = projectRef.current.buildGuide;

    if (!current || (await show(current))) return;

    const made = await generate({ quiet: true });

    if (made) await show(made.record);
  };

  const closeViewer = () => setViewing(null);

  const reveal = () => withPdf(platformBridge.revealGuide, 'Couldn’t show the PDF');

  const finish = (result: GeneratedGuide | null, quiet: boolean) => {
    if (!result) return result;

    seedGuidePages(guidePagesKey(result.record.id, result.record.generatedAt), result.html);
    planRef.current = { fingerprint: result.record.fingerprint, plan: result.plan };
    updateProjectNow((p) => ({ ...p, buildGuide: result.record }));

    if (!quiet) showToast(`Made ${sceneName} build guide`, { action: { label: 'Open', onClick: () => void open() } });

    return result;
  };

  const generate = ({ quiet = false, background = false } = {}): Promise<GeneratedGuide | null> => {
    if (runRef.current) return runRef.current;

    const abort = new AbortController();
    const startedAt = clock();

    abortRef.current = abort;
    setProgress({ share: 0, label: 'Measuring parts' });

    const started = generateGuide({
      title: sceneName,
      parts: partsRef.current,
      project: projectRef.current,
      onProgress: (p) => setProgress(withEstimate(p, startedAt)),
      onCover: setCover,
      signal: abort.signal,
      order: () => buildOrder(viewportRef.current, partsRef.current),
    })
      .then((result) => finish(result, quiet || background))
      .catch((err: unknown) => {
        if (!background) showToast(`Couldn’t make the guide. ${errorMessage(err)}`, { tone: 'error' });

        return null;
      })
      .finally(() => {
        runRef.current = null;
        abortRef.current = null;
        setProgress(null);
        setCover(null);
      });

    runRef.current = started;

    return started;
  };

  const cancel = () => abortRef.current?.abort();

  const currentPlan = async (): Promise<GuidePlan | null> => {
    const known = planRef.current;

    if (known?.fingerprint === guideFingerprint(sceneName, partsRef.current, projectRef.current)) return known.plan;

    return (await generate({ quiet: true }))?.plan ?? null;
  };

  return {
    record,
    fingerprint,
    stale,
    missing,
    progress,
    cover: cover ?? record?.coverDataUrl,
    viewing,
    generate,
    cancel,
    currentPlan,
    open,
    openPdf,
    closeViewer,
    reveal,
  };
}

export type BuildGuide = ReturnType<typeof useBuildGuide>;
