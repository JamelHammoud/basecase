import { type RefObject, useEffect, useEffectEvent, useRef, useState } from 'react';
import { sceneCapabilities } from '../routines/capabilities';
import type { RoutineEdit } from '../routines/edit';
import type { LiveUpdate } from '../routines/routineLive';
import { runSeconds } from '../routines/routineRun';
import { inRoutinesWorker } from '../routines/routinesClient';
import type { Scenario } from '../routines/scenarioTypes';
import { type Capability, type Routine, type RoutineError, validateRoutine } from '../routines/schema';
import type { Simulation } from '../sim/useSimulation';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import { useLatestRef } from '../utils/useLatestRef';
import { newId } from './helpers';
import { checkRoutine, type SceneCheck } from './routineCheck';
import { addItemFor, canAdd, mountPart } from './routineMount';
import { EMPTY_VIEW, type RoutineRun, type RoutineTests, type RoutineView, snapshotOf } from './routineTypes';
import type { CommitParts, ShowToast } from './types';
import { useRoutineEditor } from './useRoutineEditor';
import { useRoutineStore } from './useRoutineStore';

interface RoutineOptions {
  parts: ScenePart[];
  project: ProjectSettings;
  projectRef: RefObject<ProjectSettings>;
  sim: Simulation;
  commitParts: CommitParts;
  updateProjectNow: (patch: (p: ProjectSettings) => ProjectSettings) => void;
  showToast: ShowToast;
}

const NOT_COMPILED = 'Make a Routine that compiles first.';
const NO_ROUTINE: RoutineError = { code: 'not-a-routine', message: 'Make a Routine first.' };

const appendUpdate = (run: RoutineRun | null, u: LiveUpdate): RoutineRun => ({
  live: true,
  done: u.done,
  trace: [...(run?.trace ?? []), ...u.events],
  said: [...(run?.said ?? []), ...u.said],
  failures: u.failures,
});

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

  const check = (routine: Routine) => {
    const id = ++seq.current;
    const scene = sceneRef.current;
    const job = checkRoutine({ routine, ...scene, buildModel: sim.buildModel }).then((result) => {
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
  }, [parts, project.joints, active]);

  const make = async (input: unknown) => {
    const valid = validateRoutine(input);

    if (!valid.ok) return { ok: false as const, errors: valid.errors };

    store.put(valid.routine);

    return (await check(valid.routine)).compiled;
  };

  const current = async () => (await pending.current) ?? null;

  const editNow = async (edits: readonly RoutineEdit[], id?: string) => {
    const target = id ?? activeRef.current?.id;
    const result = store.edit(edits, target);
    const routine = (options.projectRef.current.routines ?? []).find((r) => r.id === target);

    if (result.errors) return { ok: false, changed: false, errors: result.errors, routine };

    if (!routine) return { ok: false, changed: false, errors: [NO_ROUTINE], routine };

    store.select(routine.id);

    const { compiled } = await check(routine);

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

  const runLive = async (scenario: Scenario) => {
    const found = await current();

    if (!found?.compiled.ok) return { started: false, message: NOT_COMPILED, errors: found?.compiled.errors };

    setView((v) => ({ ...v, run: { live: true, done: false, trace: [], said: [], failures: [] } }));

    const input = { plan: found.compiled.plan, scenario, joints: sceneRef.current.joints, kit: found.kit };
    const started = await sim.runRoutine(input, (u) => setView((v) => ({ ...v, run: appendUpdate(v.run, u) })));

    return started ? { started: true } : { started: false, message: sim.error ?? 'The simulator didn’t start.' };
  };

  const runHeadless = async (scenario: Scenario) => {
    const found = await current();

    if (!found?.compiled.ok) return { started: false, message: NOT_COMPILED, errors: found?.compiled.errors };

    const model = await sim.buildModel();
    const { plan } = found.compiled;
    const { result } = await inRoutinesWorker({
      type: 'physics',
      plan,
      scenario,
      model,
      joints: sceneRef.current.joints,
      kit: found.kit,
    });
    const { trace, said, failures, passed, physics } = result;

    setView((v) => ({ ...v, run: { live: false, done: true, trace, said, failures } }));

    return { started: true, passed, said, failures, fellAt: physics.fellAt };
  };

  const addCapability = (capability: Capability) => {
    const item = addItemFor(capability);

    if (!item) return;

    const mounted = mountPart({ parts: sceneRef.current.parts, joints: sceneRef.current.joints, item, id: newId() });

    commitParts((prev) => [...prev, mounted.part]);
    updateProjectNow((p) => ({ ...p, joints: mounted.joints }));
    showToast(`Added ${item.name}`);
  };

  const has = new Set(active ? sceneCapabilities({ parts, joints: project.joints ?? [] }) : []);
  const missing = (active?.requires ?? []).filter((c) => !has.has(c) && canAdd(c));
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
