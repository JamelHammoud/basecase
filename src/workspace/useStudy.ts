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
import { executeStudy, type StudyRequest } from './studyRun';
import type { ShowToast } from './types';
import type { SceneCaseSource } from './useCaseCompare';
import type { SceneDocument } from './useSceneDocument';
import { useStudyPreview } from './useStudyPreview';

export type StudyResult = StudyRecord;

interface StudyOptions {
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

function studyIsStale(shown: StudyRecord | null, liveKey: string) {
  return !!shown && shown.baseKey !== liveKey && !shown.rows.some((row) => row.sceneKey === liveKey);
}

export function useStudy({ kase, parts, project, source, sim, showToast, onShow }: StudyOptions) {
  const [open, setOpen] = useState(false);
  const [configured, setConfigured] = useState<StudyKnob[] | null>(null);
  const [disabled, setDisabled] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const runId = useRef(0);

  useEffect(
    () => () => {
      runId.current++;
    },
    [],
  );

  const knobs = studyKnobs(configured, project, parts);
  const enabled = knobs.filter((knob) => !disabled.includes(knob.id)).map((knob) => knob.id);
  const shown = project.study ?? null;
  const savedCase = shown?.base.project.cases?.find((item) => item.id === shown.caseId);
  const liveKey = studyFingerprint(parts, project);
  const stale = studyIsStale(shown, liveKey);
  const reportError = (error: unknown) => showToast(errorMessage(error), { tone: 'error' });
  const previewing = useStudyPreview({ shown, disabled: stale || running, onError: reportError });
  const run = async (request: StudyRequest = {}): Promise<StudyRecord | string> => {
    const turn = ++runId.current;

    flushSync(previewing.reset);
    setConfigured(knobs);
    setOpen(true);
    onShow();
    setRunning(true);

    try {
      return await executeStudy({
        request: {
          knobs: request.knobs ?? knobs.filter((k) => enabled.includes(k.id)),
          ...studyDefaults(request, kase),
        },
        source,
        sim,
        stopped: () => runId.current !== turn,
        onRecord: (record) => source.docs.updateProjectNow((p) => ({ ...p, study: record })),
      });
    } finally {
      if (turn === runId.current) setRunning(false);
    }
  };

  return {
    open,
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
    edit: (next: StudyKnob) => setConfigured(knobs.map((k) => (k.id === next.id ? next : k))),
    enable: (id: string, on: boolean) => setDisabled((s) => (on ? s.filter((k) => k !== id) : [...s, id])),
    start: () => {
      void run()
        .then((result) => typeof result === 'string' && showToast(result, { tone: 'error' }))
        .catch(reportError);
    },
    stop: () => {
      runId.current++;
      previewing.reset();
      setRunning(false);
    },
    reset: () => {
      runId.current++;
      previewing.reset();
      setRunning(false);
      setConfigured(null);
      setDisabled([]);
      setOpen(false);
    },
    preview: previewing.preview,
    apply: async (row: StudyRow) => {
      if (!shown || stale || row.error) return;

      const expected = studyFingerprint(source.docs.partsRef.current, source.docs.projectRef.current);
      const next = await previewing.replay(shown, row.selection).catch(reportError);

      if (!next) return;

      if (expected !== studyFingerprint(source.docs.partsRef.current, source.docs.projectRef.current)) return;

      previewing.reset();
      source.docs.commitStudy(next.parts, next.project);
    },
    isCurrent: (row: StudyRow) => row.sceneKey === liveKey,
  };
}

export type Study = ReturnType<typeof useStudy>;
