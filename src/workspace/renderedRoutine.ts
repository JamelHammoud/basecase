import { cameraViews, stripParts } from '../cameras/views';
import { sourcedMeshFiles } from '../three/componentMeshes';
import { packParts } from '../three/packedMesh';
import { runRenderedVisionScenario } from '../routines/renderedVisionClient';
import type { Plan } from '../routines/planTypes';
import type { FixedCamera } from '../cameras/fixed';
import type { ImportedWorldView } from '../three/viewport/importedWorld';
import type { Scenario } from '../routines/scenarioTypes';
import type { Simulation } from '../sim/useSimulation';
import type { ScenePart } from '../types/robotics';
import type { RoutineRun } from './routineTypes';
import { prepareRoutineVision } from './routineVision';

export async function runRenderedRoutine(
  plan: Plan,
  scenario: Scenario,
  input: {
    sim: Simulation;
    scene: { parts: ScenePart[]; cameras: FixedCamera[]; imported?: ImportedWorldView | null };
    setRun: (next: (run: RoutineRun | null) => RoutineRun) => void;
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
      imported: input.scene.imported,
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
