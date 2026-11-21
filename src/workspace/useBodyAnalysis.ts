import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { bodyRecordingUnchanged } from '../reality/bodyRecordingIdentity';
import type { BodyEvidenceRef } from '../reality/bodyEvidence';
import { useTries } from '../cases/tryStore';
import type { TrySummary } from '../cases/tryFile';
import { useFleet } from '../robot/useRobot';
import { bodySourceKey, evidenceApplicable, readBodyEvidence } from '../reality/bodyEvidence';
import type { WorkspaceCore } from './useWorkspaceCore';
import { useBodyAnalysisJob, type BodyInvestigationOutcome } from './useBodyAnalysisJob';
import { errorMessage } from '../utils/errorMessage';
import type { BodyMotionOutcome } from '../reality/bodyMotionTypes';
import { dayLabel } from '../utils/timeAgo';
import { useBodyExecution } from './useBodyExecution';
import { fitBodyEvidence } from './bodyActions';
import { BODY_EMULATOR_LIMIT } from '../reality/bodyExperimentTypes';
import { servoFamily } from '../robot/robotState';

let opening: { scene: string | null; version: number } = { scene: null, version: 0 };
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);

  return () => listeners.delete(listener);
};

export function openBodyAnalysis(scene: string | null) {
  opening = { scene, version: opening.version + 1 };
  listeners.forEach((listener) => listener());
}

function useBodyOpening(core: WorkspaceCore) {
  const request = useSyncExternalStore(subscribe, () => opening);
  const open =
    request.scene === core.scene.sceneId && core.active && core.tool.leftTab === 'operate' && core.studio.isLeftOpen;
  const wasOpen = useRef(false);

  useEffect(() => {
    if (wasOpen.current && !open && request.scene === core.scene.sceneId) openBodyAnalysis(null);

    wasOpen.current = open;
  }, [open, request, core.scene.sceneId]);

  return { request, open };
}

function useBodySource(
  core: WorkspaceCore,
  ref: BodyEvidenceRef | undefined,
  opening: { scene: string | null; version: number },
  open: boolean,
) {
  const [value, setFreshness] = useState<{
    parts: WorkspaceCore['parts'];
    project: WorkspaceCore['project'];
    key: string;
    reference: string | undefined;
    version: number;
    problem: string;
  } | null>(null);

  useEffect(() => {
    if (!open) return;

    let current = true;

    void Promise.all([
      bodySourceKey(core.parts, core.project),
      ref ? bodyRecordingUnchanged(ref) : Promise.resolve(false),
    ])
      .then(([key, unchanged]) => {
        if (current)
          setFreshness({
            parts: core.parts,
            project: core.project,
            key: unchanged ? key : '',
            reference: ref?.content,
            version: opening.version,
            problem: '',
          });
      })
      .catch((error: unknown) => {
        if (current)
          setFreshness({
            parts: core.parts,
            project: core.project,
            key: '',
            reference: ref?.content,
            version: opening.version,
            problem: errorMessage(error),
          });
      });

    return () => {
      current = false;
    };
  }, [core.parts, core.project, ref, opening, open]);

  const current =
    open &&
    value?.parts === core.parts &&
    value.project === core.project &&
    value.reference === ref?.content &&
    value.version === opening.version;

  return {
    ready: current && !value.problem,
    problem: current ? value.problem : '',
    key: value?.key ?? '',
  };
}

function bodyTryChoices(tries: TrySummary[], references: BodyEvidenceRef[] | undefined, scene: string) {
  const recent = tries.filter((run) => run.sceneId === scene && run.source === 'operate').slice(-32);
  const recentIds = new Set(recent.map((run) => run.id));
  const historical = (references ?? []).filter((ref) => ref.scene === scene && !recentIds.has(ref.recording));

  return [
    ...historical.map((ref) => ({ value: ref.recording, label: `${ref.unit} ${ref.recording}` })),
    ...recent.map((run) => ({ value: run.id, label: `${dayLabel(run.startedAt)} ${run.id}` })),
  ];
}

function selectedBodyTry(choices: Array<{ value: string }>, picked: string): string {
  return choices.find((run) => run.value === picked)?.value ?? choices.at(-1)?.value ?? '';
}

interface BodyReported {
  selected: string;
  unit: string;
  outcome: BodyInvestigationOutcome;
}

function currentBodyResult(reported: BodyReported | null, selected: string, unit: string) {
  return reported?.selected === selected && reported.unit === unit ? reported.outcome : null;
}

interface BodySelection {
  key: string;
  indices: number[];
}

function selectedParameters(selection: BodySelection | null, key: string, motion?: BodyMotionOutcome) {
  return selection?.key === key ? selection.indices : (motion?.selected ?? []);
}

async function readBodyInvestigation(
  reference: BodyEvidenceRef | undefined,
  open: boolean,
): Promise<BodyInvestigationOutcome> {
  const saved = reference && open ? await readBodyEvidence(reference) : null;
  const original = saved?.experiment && (await readBodyEvidence(saved.experiment.recommendation));

  return {
    analysis: saved?.result ?? (saved?.refusal ? { kind: 'refused', reason: saved.refusal, replays: 0 } : null),
    motion: saved?.motion,
    experiment: saved?.experiment,
    prediction: original?.motion,
    commands: saved?.request.run.intents.length,
    samples: saved?.request.run.statuses.length,
  };
}

function investigationDetails(shown: BodyInvestigationOutcome | null) {
  return {
    motion: shown?.motion,
    experiment: shown?.experiment,
    prediction: shown?.prediction,
    commands: shown?.commands,
    samples: shown?.samples,
  };
}

function observationLimit(fleet: ReturnType<typeof useFleet>) {
  const state = fleet.units?.find((entry) => entry.unit === fleet.selected)?.state;

  return state?.emulated && servoFamily(state.spec) ? BODY_EMULATOR_LIMIT : '';
}

export function useBodyAnalysis(core: WorkspaceCore) {
  const fleet = useFleet();
  const unit = fleet.selected;
  const tries = useTries() ?? [];
  const scene = core.scene.sceneId;
  const { request, open } = useBodyOpening(core);
  const choices = bodyTryChoices(tries, core.project.bodyEvidence, scene);
  const [picked, setPicked] = useState('');
  const selected = selectedBodyTry(choices, picked);
  const ref = core.project.bodyEvidence?.find((entry) => entry.recording === selected);
  const [reported, setReported] = useState<BodyReported | null>(null);
  const shown = currentBodyResult(reported, selected, unit);
  const result = shown?.analysis ?? null;
  const [problem, setProblem] = useState('');
  const freshness = useBodySource(core, ref, request, open);
  const applicable = !!ref && freshness.ready && evidenceApplicable(ref, { unit, scene, sourceKey: freshness.key });
  const [selection, setSelection] = useState<BodySelection | null>(null);
  const key = ref ? `${ref.unit}\0${ref.scene}\0${ref.recording}\0${ref.modelHash}\0${ref.sourceKey}\0${unit}` : '';
  const parameters = selectedParameters(selection, key, shown?.motion);

  useEffect(() => {
    let current = true;

    void readBodyInvestigation(ref, open)
      .then((outcome) => {
        if (current) setReported({ selected, unit, outcome });
      })
      .catch(() => {
        if (current) setProblem('Couldn’t read the saved body evidence.');
      });

    return () => {
      current = false;
    };
  }, [ref, open, selected, unit]);

  const job = useBodyAnalysisJob({
    core,
    unit,
    selected,
    reference: ref,
    open,
    applicable,
    report: (outcome) => setReported({ selected, unit, outcome: { ...shown, ...outcome } }),
  });
  const execution = useBodyExecution({ core, unit, reference: ref, open, recorded: setPicked });

  return {
    ready: freshness.ready,
    observationLimit: observationLimit(fleet),
    open,
    pending: job.pending || execution.pending,
    executing: execution.pending,
    selected,
    applicable,
    result,
    problem: problem || job.problem || execution.problem || freshness.problem,
    choices,
    ...investigationDetails(shown),
    execute: execution.run,
    fit: () => {
      if (ref)
        void fitBodyEvidence(core, ref)
          .then((text) => setProblem(text === BODY_EMULATOR_LIMIT ? '' : text))
          .catch((error: unknown) => setProblem(errorMessage(error)));
    },
    parameters,
    toggle: (index: number) =>
      setSelection({
        key,
        indices: parameters.includes(index) ? parameters.filter((entry) => entry !== index) : [...parameters, index],
      }),
    recommend: () => job.run('recommend', parameters),
    show: () => openBodyAnalysis(scene),
    close: () => {
      execution.cancel();
      job.cancel();
      openBodyAnalysis(null);
    },
    pick: (id: string) => {
      execution.cancel();
      job.cancel();
      setPicked(id);
      setProblem('');
      job.clear();
    },
    cancel: () => {
      job.cancel();
      execution.cancel();
    },
    analyze: () => job.run('analyze'),
  };
}

export type BodyAnalysisView = ReturnType<typeof useBodyAnalysis>;
