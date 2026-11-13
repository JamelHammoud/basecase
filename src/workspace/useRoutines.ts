import { type RefObject, useEffect, useEffectEvent, useRef, useState } from 'react';
import { sceneCapabilities } from '../routines/capabilities';
import { NOT_COMPILED, useRoutineRuns } from './useRoutineRuns';
import type { RoutineEdit } from '../routines/edit';
import { runSeconds } from '../routines/routineRun';
import { inRoutinesWorker } from '../routines/routinesClient';
import type { Scenario } from '../routines/scenarioTypes';
import { type Routine, type RoutineError, validateRoutine } from '../routines/schema';
import type { Simulation } from '../sim/useSimulation';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import { useLatestRef } from '../utils/useLatestRef';
import { isCaseLogic, routinesView } from './caseLogicRoutines';
import { checkLogic, checkRoutine, type RoutineSkills, type SceneCheck } from './routineCheck';
import { useHandoffs } from './useHandoffs';
import type { HandoffJob, HandoffTraining, SceneRoutineSkills } from './useRoutineSkills';
import { EMPTY_VIEW, type RoutineTests, type RoutineView, snapshotOf } from './routineTypes';
import type { CommitParts, ShowToast } from './types';
import { useRoutineEditor } from './useRoutineEditor';
import { useRoutineMounts } from './useRoutineMounts';
import { useRoutineStore } from './useRoutineStore';

interface RoutineOptions {
  parts: ScenePart[];
  project: ProjectSettings;
  projectRef: RefObject<ProjectSettings>;
  sim: Simulation;
  commitParts: CommitParts;
  updateProjectNow: (patch: (p: ProjectSettings) => ProjectSettings) => void;
  showToast: ShowToast;
  skills: SceneRoutineSkills;
  trainHandoff: (job: HandoffJob) => Promise<HandoffTraining | null>;
}

const NO_ROUTINE: RoutineError = { code: 'not-a-routine', message: 'Make a Routine first.' };

export const plainRun = (routine: Routine): Scenario => ({
  covers: 'run',
  world: [],
  mocks: {},
  faults: [],
  seconds: runSeconds(routine),
  expect: [],
});

export function useRoutines(options: RoutineOptions) {
  const { parts, project, sim, commitParts, updateProjectNow, showToast } = options;
  const [view, setView] = useState<RoutineView>(EMPTY_VIEW);
  const sceneRef = useLatestRef({ parts, joints: project.joints ?? [] });
  const capabilities = () => sceneCapabilities(sceneRef.current);
  const store = useRoutineStore({ project, projectRef: options.projectRef, updateProjectNow, capabilities });
  const editor = useRoutineEditor(store, showToast);
  const active = store.active;
  const activeRef = useLatestRef(active);
  const pending = useRef<Promise<SceneCheck | null>>(Promise.resolve(null));
  const seq = useRef(0);
  const handoffs = useHandoffs({
    skills: options.skills,
    train: options.trainHandoff,
    scene: sceneRef,
    buildModel: sim.buildModel,
    updateProjectNow,
  });
  const routineScene = (skills: RoutineSkills = handoffs.skills) => ({
    ...sceneRef.current,
    buildModel: sim.buildModel,
    skills,
  });

  const check = (routine: Routine, skills?: RoutineSkills) => {
    const id = ++seq.current;
    const caseLogic = isCaseLogic(options.projectRef.current, routine.id);
    const job = checkRoutine({ routine, ...routineScene(skills), caseLogic }).then((result) => {
      if (id !== seq.current) return result;

      setView((v) => {
        const run = v.routine?.id === routine.id ? v.run : null;

        return { ...v, ...result, routine, run, tests: null, checking: false };
      });

      return result;
    });

    setView((v) => ({ ...v, checking: true }));
    pending.current = job.catch(() => null);

    return job;
  };

  const recheck = useEffectEvent(() => {
    const routine = activeRef.current;

    if (!routine) {
      seq.current += 1;
      setView(EMPTY_VIEW);

      return;
    }

    void check(routine).catch(() => setView((v) => ({ ...v, checking: false })));
  });

  useEffect(() => {
    recheck();
  }, [parts, project.joints, project.skills, project.handoffs, handoffs.skills, active]);

  const make = async (input: unknown) => {
    const valid = validateRoutine(input);

    if (!valid.ok) return { ok: false as const, errors: valid.errors };

    store.put(valid.routine);

    return handoffs.proveRefused(async (skills) => (await check(valid.routine, skills)).compiled);
  };

  const current = async () => (await pending.current) ?? null;

  const editNow = async (edits: readonly RoutineEdit[], id?: string) => {
    const target = id ?? activeRef.current?.id;
    const result = store.edit(edits, target);
    const routine = routinesView(options.projectRef.current).find((r) => r.id === target);

    if (result.errors) return { ok: false, changed: false, errors: result.errors, routine };

    if (!routine) return { ok: false, changed: false, errors: [NO_ROUTINE], routine };

    store.select(routine.id);

    const compiled = await handoffs.proveRefused(async (skills) => (await check(routine, skills)).compiled);

    return { ok: compiled.ok, changed: result.changed, routine, ...(compiled.ok ? {} : { errors: compiled.errors }) };
  };

  const test = async (): Promise<RoutineTests & { errors?: RoutineError[] }> => {
    const compiled = (await current())?.compiled;

    if (!compiled?.ok) return { passed: false, scenarios: [], errors: compiled?.errors };

    const reply = await inRoutinesWorker({ type: 'test', plan: compiled.plan });
    const scenarios = reply.scenarios.map(({ covers, passed }) => ({ covers, passed }));
    const tests = { passed: scenarios.length > 0 && scenarios.every((s) => s.passed), scenarios };

    setView((v) => ({ ...v, tests }));

    return tests;
  };

  const { runLive, runHeadless } = useRoutineRuns({
    pending,
    sim,
    sceneRef,
    setRun: (run) => setView((v) => ({ ...v, run: run(v.run) })),
  });
  const { addCapability, missing } = useRoutineMounts({
    active,
    parts,
    project,
    commitParts,
    updateProjectNow,
    showToast,
  });
  const shownFor = (routine: Routine | null): RoutineView =>
    view.routine?.id === routine?.id ? { ...view, routine } : { ...EMPTY_VIEW, routine, checking: !!routine };

  return {
    view: shownFor(active),
    store,
    editor,
    missing,
    make,
    edit: (edits: readonly RoutineEdit[], id?: string) => store.edit(edits, id),
    editNow,
    checkLogic: (logic: unknown) => handoffs.proveRefused((skills) => checkLogic(logic, routineScene(skills))),
    handoffs,
    test,
    run: () => (active ? runLive(plainRun(active)) : Promise.resolve({ started: false, message: NOT_COMPILED })),
    runLive,
    runHeadless,
    addCapability,
    showToast,
    state: () => snapshotOf(shownFor(activeRef.current)),
  };
}

export type Routines = ReturnType<typeof useRoutines>;
