import { useEffect, type RefObject } from 'react';
import { useVisionScope } from '../cameras/visionScope';
import { liveSceneVision } from '../cameras/sceneVision';
import { cameraViews, stripParts } from '../cameras/views';
import type { FixedCamera } from '../cameras/fixed';
import { sourcedMeshFiles } from '../three/componentMeshes';
import { packParts } from '../three/packedMesh';
import { runRenderedVisionScenario } from '../routines/renderedVisionClient';
import type { Plan } from '../routines/planTypes';
import type { RoutineError } from '../routines/schema';
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
  sceneRef: RefObject<{ joints: RobotJoint[]; parts: ScenePart[]; cameras: FixedCamera[] }>;
  setRun: (next: (run: RoutineRun | null) => RoutineRun) => void;
  onVisionPrepared: (plan: Plan, errors: RoutineError[]) => void;
}

export function useRoutineRuns({ pending, sim, sceneRef, setRun, scope, onVisionPrepared }: RunsInput) {
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

    onVisionPrepared(found.compiled.plan, vision.errors);

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
        onVisionPrepared,
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

async function runRenderedRoutine(
  plan: Plan,
  scenario: Scenario,
  input: {
    sim: Simulation;
    scene: { parts: ScenePart[]; cameras: FixedCamera[] };
    setRun: RunsInput['setRun'];
    onVisionPrepared: RunsInput['onVisionPrepared'];
    current: () => boolean;
  },
) {
  const parts = stripParts(input.scene.parts);
  const world = input.sim.worldParts;
  const views = cameraViews(parts, world, input.scene.cameras);
  const prepared = await prepareRoutineVision(
    plan,
    views.map((view) => view.key),
    { rendered: true },
  );

  if (!input.current()) {
    prepared.release();

    return { started: false as const };
  }

  input.onVisionPrepared(plan, prepared.errors);

  if (prepared.errors.length)
    return { started: false as const, message: prepared.errors[0].message, errors: prepared.errors };

  try {
    const model = await input.sim.buildModel();

    if (!input.current()) return { started: false as const };

    const meshes = await sourcedMeshFiles([...parts, ...world]);

    if (!input.current()) return { started: false as const };

    const result = await runRenderedVisionScenario(plan, scenario, {
      parts: packParts(parts),
      world: packParts(world),
      model,
      views,
      meshes,
    });

    if (!input.current()) return { started: false as const };

    const { trace, said, failures } = result;

    input.setRun(() => ({ live: false, done: true, trace, said, failures }));

    return { started: true as const, ...result };
  } finally {
    prepared.release();
  }
}
