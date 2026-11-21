import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { analyzeBodyEvidence, bodyAnalysisCurrent } from './bodyAnalysisAction';
import { selectedUnit } from '../robot/robotStore';
import { bodyRecordingUnchanged } from '../reality/bodyRecordingIdentity';
import type { BodyEvidenceRef } from '../reality/bodyEvidence';
import { useTries } from '../cases/tryStore';
import { useFleet } from '../robot/useRobot';
import { bodyClient } from '../reality/bodyClient';
import { bodySourceKey, evidenceApplicable, readBodyEvidence, withBodyEvidence } from '../reality/bodyEvidence';
import type { BodyAnalysisOutcome } from '../reality/bodyAnalysisTypes';
import type { WorkspaceCore } from './useWorkspaceCore';
import { errorMessage } from '../utils/errorMessage';

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
          });
      })
      .catch(() => {
        if (current) setFreshness(null);
      });

    return () => {
      current = false;
    };
  }, [core.parts, core.project, ref, opening, open]);

  return {
    ready:
      open &&
      value?.parts === core.parts &&
      value.project === core.project &&
      value.reference === ref?.content &&
      value.version === opening.version,
    key: value?.key ?? '',
  };
}

export function useBodyAnalysis(core: WorkspaceCore) {
  const { selected: unit } = useFleet();
  const tries = useTries() ?? [];
  const scene = core.scene.sceneId;
  const { request, open } = useBodyOpening(core);
  const choices = tries.filter((run) => run.sceneId === scene && run.source === 'operate').slice(-32);
  const [picked, setPicked] = useState('');
  const selected = picked || choices.at(-1)?.id || '';
  const ref = core.project.bodyEvidence?.find((entry) => entry.recording === selected && entry.unit === unit);
  const [reported, setReported] = useState<{
    selected: string;
    unit: string;
    outcome: BodyAnalysisOutcome | null;
  } | null>(null);
  const result = reported?.selected === selected && reported.unit === unit ? reported.outcome : null;
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState<{
    parts: WorkspaceCore['parts'];
    project: WorkspaceCore['project'];
    unit: string;
    selected: string;
  } | null>(null);
  const pending =
    !!busy &&
    busy.parts === core.parts &&
    busy.project === core.project &&
    busy.unit === unit &&
    busy.selected === selected;
  const freshness = useBodySource(core, ref, request, open);
  const worker = useRef<ReturnType<typeof bodyClient> | null>(null);
  const generation = useRef(0);
  const cancel = () => {
    generation.current++;
    worker.current?.dispose();
    worker.current = null;
    setBusy(null);
  };

  useEffect(() => {
    let current = true;

    void (ref && open ? readBodyEvidence(ref) : Promise.resolve(null))
      .then((saved) => {
        if (current) setReported({ selected, unit, outcome: saved?.result ?? null });
      })
      .catch(() => {
        if (current) setProblem('The saved body evidence could not be read.');
      });

    return () => {
      current = false;
    };
  }, [ref, open, selected, unit]);

  useEffect(
    () => () => {
      generation.current++;
      worker.current?.dispose();
      worker.current = null;
    },
    [unit, selected, core.parts, core.project, open],
  );

  const applicable = !!ref && freshness.ready && evidenceApplicable(ref, { unit, scene, sourceKey: freshness.key });
  const analyze = async () => {
    cancel();
    setProblem('');

    if (!ref) return setProblem('This try has no matching model evidence.');

    if (!applicable) return setProblem('The source changed.');

    const ticket = generation.current;
    const client = bodyClient();

    worker.current = client;
    setBusy({ parts: core.parts, project: core.project, unit, selected });

    try {
      const outcome = await analyzeBodyEvidence({
        reference: ref,
        analyze: client.analyze,
        current: () =>
          bodyAnalysisCurrent(
            { generation: ticket, unit, parts: core.parts, project: core.project },
            {
              generation: generation.current,
              unit: selectedUnit(),
              parts: core.docs.partsRef.current,
              project: core.docs.projectRef.current,
            },
          ),
        retain: (next) => core.docs.updateProjectNow((project) => withBodyEvidence(project, next)),
      });

      if (!outcome && generation.current === ticket) openBodyAnalysis(scene);

      if (outcome && generation.current === ticket && selectedUnit() === unit) setReported({ selected, unit, outcome });
    } catch (error) {
      if (generation.current === ticket) setProblem(errorMessage(error));
    } finally {
      client.dispose();

      if (generation.current === ticket) setBusy(null);
    }
  };

  return {
    ready: freshness.ready,
    open,
    pending,
    selected,
    applicable,
    result,
    problem,
    choices: choices.map((run) => ({ value: run.id, label: `${run.startedAt} ${run.id}` })),
    show: () => openBodyAnalysis(scene),
    close: () => {
      cancel();
      openBodyAnalysis(null);
    },
    pick: (id: string) => {
      cancel();
      setPicked(id);
      setProblem('');
    },
    cancel,
    analyze: () => void analyze(),
  };
}

export type BodyAnalysisView = ReturnType<typeof useBodyAnalysis>;
