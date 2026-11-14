import type { RefObject } from 'react';
import { liveModelErrors, RoutineModelError } from '../routines/liveModels';
import type { LiveUpdate } from '../routines/routineLive';
import { inRoutinesWorker } from '../routines/routinesClient';
import type { Scenario } from '../routines/scenarioTypes';
import type { Simulation } from '../sim/useSimulation';
import type { RobotJoint } from '../types/robotics';
import type { SceneCheck } from './routineCheck';
import type { RoutineRun } from './routineTypes';

export const NOT_COMPILED = 'Make a Routine that compiles first.';

const appendUpdate = (run: RoutineRun | null, u: LiveUpdate): RoutineRun => ({
  live: true,
  done: u.done,
  trace: [...(run?.trace ?? []), ...u.events],
  said: [...(run?.said ?? []), ...u.said],
  failures: u.failures,
});

interface RunsInput {
  pending: RefObject<Promise<SceneCheck | null>>;
  sim: Simulation;
  sceneRef: RefObject<{ joints: RobotJoint[] }>;
  setRun: (next: (run: RoutineRun | null) => RoutineRun) => void;
}

export function useRoutineRuns({ pending, sim, sceneRef, setRun }: RunsInput) {
  const current = async () => (await pending.current) ?? null;
  const joints = () => sceneRef.current.joints;

  const runLive = async (scenario: Scenario) => {
    const found = await current();

    if (!found?.compiled.ok) return { started: false, message: NOT_COMPILED, errors: found?.compiled.errors };

    const errors = liveModelErrors(found.compiled.plan);

    if (errors.length) return { started: false, message: errors[0].message, errors };

    setRun(() => ({ live: true, done: false, trace: [], said: [], failures: [] }));

    const input = { plan: found.compiled.plan, scenario, joints: joints(), kit: found.kit };
    const refusal: { message?: string; errors?: RoutineModelError['errors'] } = {};
    const started = await sim
      .runRoutine(input, (u) => setRun((run) => appendUpdate(run, u)))
      .catch((reason: unknown) => {
        const message = reason instanceof Error ? reason.message : String(reason);

        Object.assign(refusal, { message, ...(reason instanceof RoutineModelError ? { errors: reason.errors } : {}) });

        setRun(() => ({ live: true, done: true, trace: [], said: [], failures: [message] }));

        return false;
      });

    return started
      ? { started: true }
      : { started: false, message: sim.error ?? 'The simulator didn’t start.', ...refusal };
  };

  const runHeadless = async (scenario: Scenario) => {
    const found = await current();

    if (!found?.compiled.ok) return { started: false, message: NOT_COMPILED, errors: found?.compiled.errors };

    const { plan } = found.compiled;

    if (scenario.tier === 'L0') {
      const { result } = await inRoutinesWorker({ type: 'scenario', plan, scenario });

      setRun(() => ({ live: false, done: true, trace: result.trace, said: result.said, failures: result.failures }));

      return { started: true, passed: result.passed, said: result.said, failures: result.failures, fellAt: null };
    }

    const model = await sim.buildModel();
    const { result } = await inRoutinesWorker({
      type: 'physics',
      plan,
      scenario,
      model,
      joints: joints(),
      kit: found.kit,
    });
    const { trace, said, failures, passed, physics } = result;

    setRun(() => ({ live: false, done: true, trace, said, failures }));

    return { started: true, passed, said, failures, fellAt: physics.fellAt };
  };

  return { runLive, runHeadless };
}
