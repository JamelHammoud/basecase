import { useEffect, useEffectEvent, useState } from 'react';
import { fittingTemplates } from '../cases/caseBuilder';
import { checkFit, type FitRow } from '../cases/fitCheck';
import { robotFacts } from '../cases/robotFit';
import { scaledToReach } from '../cases/scale';
import { parseCase, worldItem, type Case } from '../cases/schema';
import { caseTemplates, uniqueCaseId } from '../cases/templates';
import { worstFirst, type TryRecord } from '../cases/tries';
import { deleteRecording, loadRecording } from '../cases/tryStore';
import { confirmAction } from '../design-system/confirmStore';
import type { Simulation } from '../sim/useSimulation';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import type { Rig } from '../utils/kinematics';
import type { Setter, ShowToast } from './types';
import { useCaseBuilder } from './useCaseBuilder';
import { useCaseTry } from './useCaseTry';
import { useDatasetExport } from './useDatasetExport';

interface CasesOptions {
  parts: ScenePart[];
  project: ProjectSettings;
  setProject: Setter<ProjectSettings>;
  rig: Rig;
  sim: Simulation;
  showToast: ShowToast;
  openAccounts: () => void;
}

function readCases(raw: unknown[] | undefined): Case[] {
  return (raw ?? []).flatMap((c) => {
    try {
      return [parseCase(c)];
    } catch {
      return [];
    }
  });
}

export function useCases({ parts, project, setProject, rig, sim, showToast, openAccounts }: CasesOptions) {
  const cases = readCases(project.cases);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [fit, setFit] = useState<{ caseId: string | null; rows: FitRow[]; checking: boolean } | null>(null);
  const active = cases.find((c) => c.id === activeId) ?? null;
  const templates = caseTemplates(rig, parts);
  const tries = worstFirst((project.tries ?? []).filter((t) => t.caseId === activeId));
  const hasRobot = rig.robots.length > 0;
  const fixedBase = hasRobot && robotFacts(rig, parts).morphology === 'fixed';

  const open = (id: string | null) => {
    const kase = cases.find((c) => c.id === id) ?? null;
    const facts = robotFacts(rig, parts);

    setActiveId(kase?.id ?? null);
    sim.setWorld(kase ? scaledToReach(kase, facts.reachMm, facts.anchor).world.objects.map(worldItem) : []);
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

    const facts = robotFacts(rig, parts);

    sim.setWorld(scaledToReach(named, facts.reachMm, facts.anchor).world.objects.map(worldItem));

    return named;
  };

  const addTemplate = (templateId: string) => {
    const template = templates.find((t) => t.id === templateId);

    return template && !template.refusal ? add(template.build()) : null;
  };

  const remove = (id: string) => {
    const kase = cases.find((c) => c.id === id);

    if (!kase) return;

    confirmAction({
      title: `Delete ${kase.name}?`,
      body: 'Its tries go with it. You can’t undo this.',
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

  const removeTry = (record: TryRecord) =>
    confirmAction({
      title: `Delete this try?`,
      body: 'You can’t undo this.',
      onConfirm: () => {
        void deleteRecording(record.id);
        setProject((p) => ({ ...p, tries: (p.tries ?? []).filter((t) => t.id !== record.id) }));
      },
    });

  const replay = async (record: TryRecord) => {
    const recording = await loadRecording(record.id);

    if (recording && sim.model) sim.replay(recording);
  };

  const runFit = async () => {
    setFit({ caseId: activeId, rows: [], checking: true });

    const rows = await checkFit({
      kase: active,
      rig,
      parts,
      build: sim.buildModel,
      run: async ({ model, controller, seconds, commands }) =>
        (await sim.runOn(model, { seconds, controller, commands })).stats,
    });

    setFit({ caseId: activeId, rows, checking: false });
  };

  const builder = useCaseBuilder({ rig, parts, add });
  const dataset = useDatasetExport({ sim, rig, parts, active, tries, showToast, openAccounts });
  const attempt = useCaseTry({
    sim,
    rig,
    parts,
    active,
    onTry: (record) => setProject((p) => ({ ...p, tries: [...(p.tries ?? []), record] })),
  });

  return {
    cases,
    active,
    templates,
    examples: fittingTemplates(templates),
    builder,
    dataset,
    tries,
    hasRobot,
    fixedBase,
    fit: fit && fit.caseId === activeId ? fit : null,
    open,
    add,
    addTemplate,
    remove,
    removeTry,
    replay,
    runFit,
    attempt,
  };
}

export type Cases = ReturnType<typeof useCases>;
