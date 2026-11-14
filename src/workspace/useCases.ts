import { useEffect, useEffectEvent, useState } from 'react';
import { uniqueCaseId } from '../cases/caseBuilder';
import { stageCase } from '../cases/caseCast';
import { robotFacts } from '../cases/robotFit';
import { readCases, worldItem, type Case } from '../cases/schema';
import type { SlotRobot } from '../cases/slots';
import { tryRefs, withGenerated, worstFirst, type TryRecord } from '../cases/tries';
import { deleteTries, storedTries } from '../cases/tryStore';
import { confirmAction } from '../design-system/confirmStore';
import { confirmTriesDelete } from '../components/tries/confirmTriesDelete';
import type { Simulation } from '../sim/useSimulation';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import type { Rig } from '../utils/kinematics';
import type { Setter, ShowToast } from './types';
import { useCaseBuilder } from './useCaseBuilder';
import type { RoutineSkills } from './routineCheck';
import { useAddAndTry } from './useAddAndTry';
import { useCaseTry } from './useCaseTry';
import { useDatasetExport } from './useDatasetExport';
import { useTryMultiply } from './useTryMultiply';
import { useTryTimeline } from './useTryTimeline';
import { useTriesTraining, type TriesTraining } from './useTriesTraining';
import { useStoredTries } from './useStoredTries';
import { useTryMigration } from './useTryMigration';
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

const withoutRefs = (project: ProjectSettings, gone: Set<string>): ProjectSettings => ({
  ...project,
  tries: (project.tries ?? []).filter((t) => !gone.has(t.id)),
});

const sceneTries = (project: ProjectSettings, stored: TryRecord[]) => {
  const refs = new Set((project.tries ?? []).map((t) => t.id));

  return stored.filter((t) => refs.has(t.id));
};

export function useCases(options: CasesOptions) {
  const { parts, project, setProject, rig, sim, showToast, openAccounts, sceneId, partners } = options;
  const { skillTraining, caseRobot } = options;
  const cases = readCases(project.cases);
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = cases.find((c) => c.id === activeId) ?? null;
  const stored = useStoredTries();
  const tries = worstFirst(sceneTries(project, stored).filter((t) => t.case?.id === activeId));
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

  useTryMigration({ project, setProject, sceneId, cases, sim, rig });

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
        const going = sceneTries(project, storedTries()).filter((t) => t.case?.id === id);

        setProject((p) => ({ ...p, cases: (p.cases ?? []).filter((c) => c.id !== id) }));
        dropTries(going.map((t) => t.id));

        if (activeId === id) open(null);
      },
    });
  };

  const timeline = useTryTimeline({ sim, rig, parts, active, partners });

  const builder = useCaseBuilder({ rig, parts, add, partners });
  const dataset = useDatasetExport({ sim, rig, parts, active, tries, showToast, openAccounts, sceneId });
  const addTries = (records: TryRecord[]) =>
    setProject((p) => ({ ...p, tries: [...(p.tries ?? []), ...tryRefs(records)] }));
  const multiply = useTryMultiply({ sim, rig, parts, active, tries, partners, onTries: addTries, showToast });

  function dropTries(ids: string[]) {
    const gone = withGenerated(storedTries(), ids);

    if (multiply.running && gone.has(multiply.running.source)) multiply.stop();

    if (timeline.record && gone.has(timeline.record.id)) timeline.close();

    setProject((p) => withoutRefs(p, gone));
    void deleteTries([...gone]);
  }

  const removeTry = (record: TryRecord) => confirmTriesDelete([record.id], dropTries);

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
    sceneId,
    active,
    partners,
    onTry: (record) => addTries([record]),
    onRefuse: (message) => showToast(message),
  });

  const addAndTry = useAddAndTry({ add, active, attempt });

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
    addAndTry,
    remove,
    removeTry,
    deleteTries: dropTries,
    timeline,
    attempt,
    multiply,
  };
}

export type Cases = ReturnType<typeof useCases>;
