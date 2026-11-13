import { useEffect, useEffectEvent, useState } from 'react';
import { uniqueCaseId } from '../cases/caseBuilder';
import { stageCase } from '../cases/caseCast';
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
import type { RoutineSkills } from './routineCheck';
import { useCaseTry } from './useCaseTry';
import { useDatasetExport } from './useDatasetExport';
import { useTryMultiply } from './useTryMultiply';
import { useTryTimeline } from './useTryTimeline';
import { useTriesTraining, type TriesTraining } from './useTriesTraining';
import type { SkillsRuntime } from '../skills/skillsRuntime';
import type { CaseRobotInput } from './caseChecks';

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
  skills?: RoutineSkills;
  skillTraining: { runtime: SkillsRuntime; busy: boolean };
  caseRobot: () => Promise<CaseRobotInput | null>;
}

export function useCases(options: CasesOptions) {
  const { parts, project, setProject, rig, sim, showToast, openAccounts, sceneId, partners } = options;
  const { skillTraining, caseRobot } = options;
  const cases = readCases(project.cases);
  const [activeId, setActiveId] = useState<string | null>(null);
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

        if (gone.some((t) => t.id === multiply.running?.source)) multiply.stop();

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

  const builder = useCaseBuilder({ rig, parts, add, partners });
  const dataset = useDatasetExport({ sim, rig, parts, active, tries, showToast, openAccounts, sceneId });
  const addTries = (records: TryRecord[]) => setProject((p) => ({ ...p, tries: [...(p.tries ?? []), ...records] }));
  const multiply = useTryMultiply({ sim, rig, parts, active, tries, partners, onTries: addTries, showToast });
  const removeTry = (record: TryRecord) => {
    const generated = generatedFrom(tries, record);
    const known = [record.id, ...generated.map((t) => t.id)];
    const goes = (t: TryRecord) => t.id === record.id || (t.generated && t.manifest.source === record.id);

    confirmAction({
      title: `Delete this try?`,
      ...(generated.length ? { body: `Its ${generated.length} generated tries go with it.` } : {}),
      onConfirm: () => {
        if (multiply.running?.source === record.id) multiply.stop();

        if (timeline.record && goes(timeline.record)) timeline.close();

        known.forEach((id) => void deleteRecording(id));
        setProject((p) => ({ ...p, tries: (p.tries ?? []).filter((t) => !goes(t)) }));
      },
    });
  };

  const fromTries: TriesTraining = useTriesTraining({
    sim,
    active,
    tries,
    skills: skillTraining,
    caseRobot,
    showToast,
  });
  const attempt = useCaseTry({
    skills: options.skills,
    sim,
    rig,
    parts,
    joints: project.joints ?? [],
    active,
    partners,
    onTry: (record) => addTries([record]),
    onRefuse: (message) => showToast(message),
  });

  return {
    cases,
    active,
    builder,
    dataset,
    fromTries,
    tries,
    hasRobot,
    fixedBase,
    open,
    add,
    remove,
    removeTry,
    timeline,
    attempt,
    multiply,
  };
}

export type Cases = ReturnType<typeof useCases>;
