import { useEffect, type RefObject } from 'react';
import { useVisionScope } from '../cameras/visionScope';
import { liveSceneVision } from '../cameras/sceneVision';
import type { FixedCamera } from '../cameras/fixed';
import type { ImportedWorldView } from '../three/viewport/importedWorld';
import { runRenderedRoutine } from './renderedRoutine';
import type { LiveUpdate } from '../routines/routineLive';
import { inRoutinesWorker } from '../routines/routinesClient';
import type { Scenario } from '../routines/scenarioTypes';
import type { Simulation } from '../sim/useSimulation';
import type { RobotJoint, ScenePart } from '../types/robotics';
import type { SceneCheck } from './routineCheck';
import type { RoutineRun } from './routineTypes';
import { prepareRoutineVision } from './routineVision';
import { useStartupLease } from './useStartupLease';

export const NOT_COMPILED = 'Make a Routine that compiles first.';

const appendUpdate = (run: RoutineRun | null, u: LiveUpdate): RoutineRun => ({
  live: true,
  done: u.done,
  trace: [...(run?.trace ?? []), ...u.events],
  said: [...(run?.said ?? []), ...u.said],
  failures: u.failures,
});

interface RunsInput {
  scope: unknown;
  pending: RefObject<Promise<SceneCheck | null>>;
  sim: Simulation;
  sceneRef: RefObject<{
    joints: RobotJoint[];
    parts: ScenePart[];
    cameras: FixedCamera[];
    imported?: ImportedWorldView | null;
  }>;
  setRun: (next: (run: RoutineRun | null) => RoutineRun) => void;
}

export function useRoutineRuns({ pending, sim, sceneRef, setRun, scope }: RunsInput) {
  const cameraVision = liveSceneVision(useVisionScope());
  const lease = useStartupLease(scope, sim.subscribeStop);
  const headless = useStartupLease(scope, sim.subscribeStop);

  useEffect(() => {
    if (sim.status === 'error') lease.cancel();
  }, [sim.status, lease]);

  const current = async () => (await pending.current) ?? null;
  const joints = () => sceneRef.current.joints;

  const runLive = async (scenario: Scenario) => {
    const ticket = lease.claim();
    const found = await current();

    if (!lease.current(ticket)) return { started: false };

    if (!found?.compiled.ok) return { started: false, message: NOT_COMPILED, errors: found?.compiled.errors };

    const vision = await prepareRoutineVision(found.compiled.plan, cameraVision.availableVisionCameras(), {
      vision: cameraVision,
      current: () => lease.current(ticket),
    });

    if (!lease.retain(ticket, vision.release)) return { started: false };

    if (vision.errors.length) {
      lease.finish(ticket);

      return { started: false, message: vision.errors[0].message, errors: vision.errors };
    }

    setRun(() => ({ live: true, done: false, trace: [], said: [], failures: [] }));

    const input = { plan: found.compiled.plan, scenario, joints: joints(), kit: found.kit, vision: true };
    const started = await sim
      .runRoutine(
        input,
        (u) => {
          if (!lease.current(ticket)) return;

          setRun((run) => appendUpdate(run, u));

          if (u.done) lease.finish(ticket);
        },
        () => lease.current(ticket),
      )
      .catch((error: unknown) => {
        lease.finish(ticket);

        throw error;
      });

    if (!lease.current(ticket)) return { started: false };

    if (!started) lease.finish(ticket);

    return started ? { started: true } : { started: false, message: sim.error ?? 'The simulator didn’t start.' };
  };

  const runHeadless = async (scenario: Scenario) => {
    const ticket = headless.claim();
    const found = await current();

    if (!headless.current(ticket)) return { started: false };

    if (!found?.compiled.ok) return { started: false, message: NOT_COMPILED, errors: found?.compiled.errors };

    if (scenario.tier === 'L2')
      return runRenderedRoutine(found.compiled.plan, scenario, {
        sim,
        scene: sceneRef.current,
        setRun,
        current: () => headless.current(ticket),
      });

    const model = await sim.buildModel();

    if (!headless.current(ticket)) return { started: false };

    const { plan } = found.compiled;
    const { result } = await inRoutinesWorker({
      type: 'physics',
      plan,
      scenario,
      model,
      joints: joints(),
      kit: found.kit,
    });

    if (!headless.current(ticket)) return { started: false };

    const { trace, said, failures, passed, physics } = result;

    setRun(() => ({ live: false, done: true, trace, said, failures }));

    return { started: true, passed, said, failures, fellAt: physics.fellAt };
  };

  return { runLive, runHeadless };
}
