import { useEffect, useEffectEvent, useState, type RefObject } from 'react';
import { uniqueCaseId } from '../cases/caseBuilder';
import { stageCase } from '../cases/caseCast';
import { robotFacts } from '../cases/robotFit';
import { withGesture, type CaseGesture } from '../cases/gestures';
import { readCases, worldItem, type Case } from '../cases/schema';
import type { SlotRobot } from '../cases/slots';
import { generatedFrom, simTries, worstFirst, type TryRecord } from '../cases/tries';
import { confirmAction } from '../design-system/confirmStore';
import type { Viewport3DHandle } from '../components/Viewport3D';
import type { Simulation } from '../sim/useSimulation';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import type { Rig } from '../utils/kinematics';
import type { Setter, ShowToast } from './types';
import { useCaseBuilder } from './useCaseBuilder';
import { useCaseNames } from './useCaseNames';
import type { RoutineSkills } from './routineCheck';
import { useAddAndTry } from './useAddAndTry';
import { useCaseTry } from './useCaseTry';
import { useRealRobotTries } from './useRealRobotTries';
import { useDatasetExport } from './useDatasetExport';
import { useTryMultiply, type TryMultiply } from './useTryMultiply';
import { useTryTimeline, type TryTimeline } from './useTryTimeline';
import { useTriesTraining, type TriesTraining } from './useTriesTraining';
import { useSceneTries, type SceneTries } from './useSceneTries';
import { plural } from '../../electron/plural.mjs';
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
  viewportRef: RefObject<Viewport3DHandle | null>;
}

interface TryRemoval {
  tries: TryRecord[];
  multiply: TryMultiply;
  timeline: TryTimeline;
  scene: SceneTries;
}

function confirmRemoveTry(record: TryRecord, { tries, multiply, timeline, scene }: TryRemoval) {
  const generated = generatedFrom(tries, record).length;
  const goes = (t: TryRecord) => t.id === record.id || (t.generated === true && t.manifest.source === record.id);

  confirmAction({
    title: `Delete this try?`,
    ...(generated ? { body: `Deletes its ${plural(generated, 'variation')} too.` } : {}),
    onConfirm: () => {
      if (multiply.running?.source === record.id) multiply.stop();

      if (timeline.record && goes(timeline.record)) timeline.close();

      scene.drop(goes);
    },
  });
}

function saveGesture(setProject: Setter<ProjectSettings>, { id, gesture }: { id: string; gesture: CaseGesture }) {
  setProject((p) => ({
    ...p,
    cases: (p.cases ?? []).map((c) => (c.id === id ? { ...c, gestures: withGesture(c.gestures, gesture) } : c)),
  }));
}

export function useCases(options: CasesOptions) {
  const { parts, project, setProject, rig, sim, showToast, openAccounts, sceneId, partners } = options;
  const { skillTraining, caseRobot } = options;
  const cases = readCases(project.cases);
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = cases.find((c) => c.id === activeId) ?? null;
  const scene = useSceneTries({ project, setProject, sceneId, sim, parts, showToast });
  const tries = worstFirst(scene.all.filter((t) => t.caseId === activeId));
  const fromSim = simTries(tries);
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
        const goes = (t: TryRecord) => t.caseId === id;

        if (scene.all.some((t) => goes(t) && t.id === multiply.running?.source)) multiply.stop();

        scene.drop(goes);
        setProject((p) => ({ ...p, cases: (p.cases ?? []).filter((c) => c.id !== id) }));

        if (activeId === id) open(null);
      },
    });
  };

  const timeline = useTryTimeline({ sim, rig, parts, active, partners });

  const builder = useCaseBuilder({ rig, parts, add, partners });
  const naming = useCaseNames(setProject);
  const dataset = useDatasetExport({ sim, rig, parts, active, tries: fromSim, showToast, openAccounts, sceneId });
  const multiply = useTryMultiply({ sim, rig, parts, active, tries: fromSim, partners, onTries: scene.add, showToast });
  const removeTry = (record: TryRecord) => confirmRemoveTry(record, { tries, multiply, timeline, scene });
  const forget = (ids: readonly string[]) => {
    const gone = new Set(ids);

    if (multiply.running && gone.has(multiply.running.source)) multiply.stop();

    if (timeline.record && gone.has(timeline.record.id)) timeline.close();

    scene.unlink(ids);
  };

  const fromTries: TriesTraining = useTriesTraining({
    sim,
    active,
    tries: fromSim,
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
    onTry: (draft) => void scene.add([draft]),
    onRefuse: (message) => showToast(message),
  });

  const addAndTry = useAddAndTry({ add, active, attempt });
  const real = useRealRobotTries({
    ...{ sim, rig, parts, active, tries, partners, attempt, timeline },
    viewportRef: options.viewportRef,
    onTry: (draft) => void scene.add([draft]),
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
    addAndTry,
    remove,
    naming,
    removeTry,
    forget,
    saveGesture: (gesture: CaseGesture) => active && saveGesture(setProject, { id: active.id, gesture }),
    timeline,
    attempt,
    multiply,
    ...real,
  };
}

export type Cases = ReturnType<typeof useCases>;
