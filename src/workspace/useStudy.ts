import { studyApplication } from './studySourcingApply';
import type { StudySourcingRequirements } from '../study/sourcing';
import { flushSync } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import type { Case } from '../cases/schema';
import type { Simulation } from '../sim/useSimulation';
import { defaultStudyKnobs, studyFingerprint } from '../study/study';
import { studyCaseLabel } from '../study/context';
import type { StudyKnob, StudyRecord, StudyRow } from '../study/types';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import { errorMessage } from '../utils/errorMessage';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import { useStudyVisibility } from './useStudyVisibility';
import { executeStudy, type StudyRequest } from './studyRun';
import type { ShowToast } from './types';
import type { SceneCaseSource } from './useCaseCompare';
import type { SceneDocument } from './useSceneDocument';
import { useStudyPreview } from './useStudyPreview';

export type StudyResult = StudyRecord;

interface StudyOptions {
  inFront: boolean;
  kase: Case | null;
  parts: ScenePart[];
  project: ProjectSettings;
  source: SceneCaseSource & {
    docs: Pick<SceneDocument, 'partsRef' | 'projectRef' | 'updateProjectNow' | 'commitStudy'>;
  };
  sim: Simulation;
  showToast: ShowToast;
  onShow: () => void;
}

function studyDefaults(request: StudyRequest, kase: Case | null) {
  return {
    seed: request.seed ?? 1,
    limit: request.limit ?? 64,
    kase: request.kase === undefined ? kase : request.kase,
  };
}

export function studyKnobs(configured: StudyKnob[] | null, project: ProjectSettings, parts: ScenePart[]) {
  const saved = project.study?.knobs ?? [];
  const savedIds = new Set(saved.map((knob) => knob.id));
  const knobs = configured ?? [...saved, ...defaultStudyKnobs(parts, project).filter((knob) => !savedIds.has(knob.id))];

  return IS_WEB_DEMO ? knobs.filter((knob) => knob.kind !== 'dimension') : knobs;
}

function studyModeKnobs(knobs: StudyKnob[], visibility: boolean) {
  return visibility ? knobs.filter((knob) => knob.kind === 'camera_pose' || knob.kind === 'camera_lens') : knobs;
}

function sourcingChoice(configured: StudySourcingRequirements | null | undefined, shown: StudyRecord | null) {
  return configured === undefined ? shown?.sourcing?.requirements : configured;
}

export function sourcingRequest(request: StudyRequest, sourcing: StudySourcingRequirements | null | undefined) {
  return Object.hasOwn(request, 'sourcing') ? request.sourcing : (sourcing ?? undefined);
}

function studyIsStale(shown: StudyRecord | null, liveKey: string) {
  return !!shown && shown.baseKey !== liveKey && !shown.rows.some((row) => row.sceneKey === liveKey);
}

function studyStaleness(shown: StudyRecord | null, liveKey: string, sourceStale: boolean) {
  return sourceStale || studyIsStale(shown, liveKey);
}

export function useStudy({ inFront, kase, parts, project, source, sim, showToast, onShow }: StudyOptions) {
  const [open, setOpen] = useState(false);
  const [configured, setConfigured] = useState<StudyKnob[] | null>(null);
  const [configuredSourcing, setSourcing] = useState<StudySourcingRequirements | null | undefined>(undefined);
  const [disabled, setDisabled] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const runId = useRef(0);
  const foreground = useRef(inFront);
  const abortRun = useRef<AbortController | null>(null);

  useEffect(() => {
    foreground.current = inFront;
  }, [inFront]);

  useEffect(
    () => () => {
      runId.current++;
      abortRun.current?.abort();
    },
    [],
  );

  const visibility = useStudyVisibility({ project, parts, kase, sceneId: source.sceneId });
  const availableKnobs = studyKnobs(configured, project, parts);
  const knobs = studyModeKnobs(availableKnobs, !!visibility.request);
  const enabled = knobs.filter((knob) => !disabled.includes(knob.id)).map((knob) => knob.id);
  const shown = project.study ?? null;
  const sourcing = sourcingChoice(configuredSourcing, shown);
  const savedCase = shown?.base.project.cases?.find((item) => item.id === shown.caseId);
  const liveKey = studyFingerprint(parts, project);
  const stale = studyStaleness(shown, liveKey, visibility.stale);
  const reportError = (error: unknown) => showToast(errorMessage(error), { tone: 'error' });
  const previewing = useStudyPreview({ shown, disabled: stale || running, onError: reportError });
  const run = async (request: StudyRequest = {}): Promise<StudyRecord | string> => {
    abortRun.current?.abort();

    const controller = new AbortController();
    const turn = ++runId.current;

    abortRun.current = controller;

    flushSync(previewing.reset);
    setConfigured(availableKnobs);
    setOpen(true);
    onShow();
    setRunning(true);
    visibility.accept();

    try {
      return await executeStudy({
        request: {
          knobs: request.knobs ?? knobs.filter((k) => enabled.includes(k.id)),
          ...studyDefaults(request, kase),
          visibility: request.visibility ?? visibility.request,
          sourcing: sourcingRequest(request, sourcing),
        },
        source,
        sim,
        signal: controller.signal,
        stopped: () => runId.current !== turn,
        onRecord: (record) => source.docs.updateProjectNow((p) => ({ ...p, study: record })),
      });
    } finally {
      if (turn === runId.current) setRunning(false);
    }
  };

  return {
    open,
    inFront,
    visibility,
    sourcing,
    setSourcing,
    sceneName: source.sceneName,
    knobs,
    enabled,
    running,
    shown,
    caseLabel: studyCaseLabel(savedCase, kase),
    stale,
    run,
    available: parts.length > 0,
    previewScene: stale ? null : (previewing.previewed?.scene ?? null),
    previewKey: stale ? null : (previewing.previewed?.key ?? null),
    completed: shown?.rows.length ?? 0,
    total: shown?.total ?? 0,
    show: () => {
      setOpen(true);
      onShow();
    },
    configure: (next: StudyKnob[]) => {
      setConfigured(next);
      setDisabled([]);
    },
    edit: (next: StudyKnob) => setConfigured(availableKnobs.map((k) => (k.id === next.id ? next : k))),
    enable: (id: string, on: boolean) => setDisabled((s) => (on ? s.filter((k) => k !== id) : [...s, id])),
    start: () => {
      const turn = runId.current + 1;

      void run()
        .then((result) => typeof result === 'string' && runId.current === turn && showToast(result, { tone: 'error' }))
        .catch((error: unknown) => runId.current === turn && reportError(error));
    },
    stop: () => {
      runId.current++;
      abortRun.current?.abort();
      previewing.reset();
      setRunning(false);
    },
    reset: () => {
      runId.current++;
      abortRun.current?.abort();
      previewing.reset();
      setRunning(false);
      setConfigured(null);
      setSourcing(undefined);
      visibility.reset();
      setDisabled([]);
      setOpen(false);
    },
    preview: previewing.preview,
    apply: (row: StudyRow) =>
      studyApplication({ shown, stale, source, runId, foreground, previewing, showToast, reportError })(row),
    isCurrent: (row: StudyRow) => row.sceneKey === liveKey,
  };
}

export type Study = ReturnType<typeof useStudy>;
