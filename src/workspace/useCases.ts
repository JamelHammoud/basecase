import { useEffect, useEffectEvent, useState } from 'react';
import { uniqueCaseId } from '../cases/caseBuilder';
import { stageCase } from '../cases/caseCast';
import { checkFit, type FitRow } from '../cases/fitCheck';
import { robotFacts } from '../cases/robotFit';
import { readCases, worldItem, type Case } from '../cases/schema';
import type { SlotRobot } from '../cases/slots';
import { generatedFrom, worstFirst, type TryRecord } from '../cases/tries';
import { deleteRecording } from '../cases/tryStore';
import { confirmAction } from '../design-system/confirmStore';
import type { Simulation } from '../sim/useSimulation';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import type { Rig } from '../utils/kinematics';
import type { Setter, ShowToast } from './types';
import { useCaseBuilder } from './useCaseBuilder';
import { useCaseTry } from './useCaseTry';
import { useDatasetExport } from './useDatasetExport';
import { useMultiply } from './useMultiply';
import { useTryTimeline } from './useTryTimeline';

interface CasesOptions {
  parts: ScenePart[];
  project: ProjectSettings;
  setProject: Setter<ProjectSettings>;
  rig: Rig;
  sim: Simulation;
  showToast: ShowToast;
  openAccounts: () => void;
  sceneId: string;
  partners: () => SlotRobot[];
}

export function useCases(options: CasesOptions) {
  const { parts, project, setProject, rig, sim, showToast, openAccounts, sceneId, partners } = options;
  const cases = readCases(project.cases);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [fit, setFit] = useState<{ caseId: string | null; rows: FitRow[]; checking: boolean } | null>(null);
  const active = cases.find((c) => c.id === activeId) ?? null;
  const tries = worstFirst((project.tries ?? []).filter((t) => t.caseId === activeId));
  const hasRobot = rig.robots.length > 0;
  const fixedBase = hasRobot && robotFacts(rig, parts).morphology === 'fixed';

  const stage = (kase: Case | null) => {
    const staged = kase && stageCase(kase, { rig, parts }, partners());

    sim.setWorld(staged?.kase.world.objects.map(worldItem) ?? [], staged?.joined);
  };

  const open = (id: string | null) => {
    const kase = cases.find((c) => c.id === id) ?? null;

    setActiveId(kase?.id ?? null);
    stage(kase);
  };

  const orphaned = activeId !== null && !active;
  const closeOrphan = useEffectEvent(() => {
    setActiveId(null);
    sim.setWorld([]);
  });

  useEffect(() => {
    if (!orphaned) return;

    const soon = setTimeout(closeOrphan, 0);

    return () => clearTimeout(soon);
  }, [orphaned]);

  const add = (kase: Case) => {
    const id = uniqueCaseId(
      kase.id,
      cases.map((c) => c.id),
    );
    const named = { ...kase, id };

    setProject((p) => ({ ...p, cases: [...(p.cases ?? []), named] }));
    setActiveId(id);
    stage(named);

    return named;
  };

  const remove = (id: string) => {
    const kase = cases.find((c) => c.id === id);

    if (!kase) return;

    confirmAction({
      title: `Delete ${kase.name}?`,
      body: 'Its tries go with it.',
      onConfirm: () => {
        const gone = (project.tries ?? []).filter((t) => t.caseId === id);

        gone.forEach((t) => void deleteRecording(t.id));
        setProject((p) => ({
          ...p,
          cases: (p.cases ?? []).filter((c) => c.id !== id),
          tries: (p.tries ?? []).filter((t) => t.caseId !== id),
        }));

        if (activeId === id) open(null);
      },
    });
  };

  const timeline = useTryTimeline({ sim, rig, parts, active, partners });

  const removeTry = (record: TryRecord) => {
    const generated = generatedFrom(project.tries ?? [], record.id);

    confirmAction({
      title: `Delete this try?`,
      body: generated.length ? `Its ${generated.length} generated tries go with it.` : undefined,
      onConfirm: () => {
        const gone = new Set([record.id, ...generated.map((t) => t.id)]);

        if (timeline.record && gone.has(timeline.record.id)) timeline.close();

        gone.forEach((id) => void deleteRecording(id));
        setProject((p) => ({ ...p, tries: (p.tries ?? []).filter((t) => !gone.has(t.id)) }));
      },
    });
  };

  const runFit = async () => {
    setFit({ caseId: activeId, rows: [], checking: true });

    const rows = await checkFit({
      kase: active,
      rig,
      parts,
      partners: active ? stageCase(active, { rig, parts }, partners()).partners.flatMap((r) => r ?? []) : [],
      build: sim.buildModel,
      run: async ({ model, controller, seconds, commands }) =>
        (await sim.runOn(model, { seconds, controller, commands })).stats,
    });

    setFit({ caseId: activeId, rows, checking: false });
  };

  const builder = useCaseBuilder({ rig, parts, add, partners });
  const dataset = useDatasetExport({ sim, rig, parts, active, tries, showToast, openAccounts, sceneId });
  const multiply = useMultiply({ sim, rig, parts, active, partners, tries, setProject, showToast });
  const attempt = useCaseTry({
    sim,
    rig,
    parts,
    joints: project.joints ?? [],
    active,
    partners,
    onTry: (record) => setProject((p) => ({ ...p, tries: [...(p.tries ?? []), record] })),
    onRefuse: (message) => showToast(message),
  });

  return {
    cases,
    active,
    builder,
    dataset,
    multiply,
    tries,
    hasRobot,
    fixedBase,
    fit: fit && fit.caseId === activeId ? fit : null,
    open,
    add,
    remove,
    removeTry,
    timeline,
    runFit,
    attempt,
  };
}

export type Cases = ReturnType<typeof useCases>;
