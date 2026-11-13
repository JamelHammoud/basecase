import type { RefObject } from 'react';
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

    setRun(() => ({ live: true, done: false, trace: [], said: [], failures: [] }));

    const input = { plan: found.compiled.plan, scenario, joints: joints(), kit: found.kit };
    const started = await sim.runRoutine(input, (u) => setRun((run) => appendUpdate(run, u)));

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
      joints: joints(),
      kit: found.kit,
    });
    const { trace, said, failures, passed, physics } = result;

    setRun(() => ({ live: false, done: true, trace, said, failures }));

    return { started: true, passed, said, failures, fellAt: physics.fellAt };
  };

  return { runLive, runHeadless };
}
