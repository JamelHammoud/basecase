import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { Simulation } from '../sim/useSimulation';
import type { LiveUpdate } from '../routines/routineLive';
import { inRoutinesWorker } from '../routines/routinesClient';
import type { Scenario } from '../routines/scenarioTypes';
import { type Capability, type Routine, type RoutineError, validateRoutine } from '../routines/schema';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import { useLatestRef } from '../utils/useLatestRef';
import { newId } from './helpers';
import { checkRoutine, type SceneCheck } from './routineCheck';
import { addItemFor, canAdd, mountPart } from './routineMount';
import { sceneCapabilities } from '../routines/capabilities';
import { EMPTY_VIEW, type RoutineRun, type RoutineTests, type RoutineView, snapshotOf } from './routineTypes';
import type { CommitParts } from './types';

interface RoutineOptions {
  parts: ScenePart[];
  project: ProjectSettings;
  sim: Simulation;
  commitParts: CommitParts;
  updateProjectNow: (patch: (p: ProjectSettings) => ProjectSettings) => void;
  showToast: (message: string) => void;
}

const NOT_COMPILED = 'Make a Routine that compiles first.';

const appendUpdate = (run: RoutineRun | null, u: LiveUpdate): RoutineRun => ({
  live: true,
  done: u.done,
  trace: [...(run?.trace ?? []), ...u.events],
  said: [...(run?.said ?? []), ...u.said],
  failures: u.failures,
});

export function useRoutines({ parts, project, sim, commitParts, updateProjectNow, showToast }: RoutineOptions) {
  const [view, setView] = useState<RoutineView>(EMPTY_VIEW);
  const viewRef = useLatestRef(view);
  const sceneRef = useLatestRef({ parts, joints: project.joints ?? [] });
  const pending = useRef<Promise<SceneCheck | null>>(Promise.resolve(null));
  const seq = useRef(0);

  const check = (routine: Routine | unknown) => {
    const id = ++seq.current;
    const scene = sceneRef.current;
    const job = checkRoutine({ routine, ...scene, buildModel: sim.buildModel }).then((result) => {
      if (id === seq.current) setView((v) => ({ ...v, ...result, tests: null, checking: false }));

      return result;
    });

    setView((v) => ({ ...v, checking: true }));
    pending.current = job.catch(() => null);

    return job;
  };

  const recheck = useEffectEvent(() => {
    const routine = viewRef.current.routine;

    if (routine) void check(routine).catch(() => setView((v) => ({ ...v, checking: false })));
  });

  useEffect(() => {
    recheck();
  }, [parts, project.joints]);

  const make = async (routine: unknown) => {
    const valid = validateRoutine(routine);

    setView({ ...EMPTY_VIEW, routine: valid.ok ? valid.routine : null });

    return (await check(routine)).compiled;
  };

  const current = async () => (await pending.current) ?? null;

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

  const has = new Set(view.routine ? sceneCapabilities({ parts, joints: project.joints ?? [] }) : []);
  const missing = (view.routine?.requires ?? []).filter((c) => !has.has(c) && canAdd(c));

  return {
    view,
    missing,
    make,
    test,
    runLive,
    runHeadless,
    addCapability,
    state: () => snapshotOf(viewRef.current),
  };
}

export type Routines = ReturnType<typeof useRoutines>;
