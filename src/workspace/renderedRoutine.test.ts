import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Plan } from '../routines/planTypes';
import type { Scenario } from '../routines/scenarioTypes';
import type { Simulation } from '../sim/useSimulation';
import type { ImportedWorldView } from '../three/viewport/importedWorld';
import { runRenderedRoutine } from './renderedRoutine';

const rendering = vi.hoisted(() => ({
  run: vi.fn(),
  prepare: vi.fn(),
  release: vi.fn(),
  meshes: vi.fn(),
}));

vi.mock('../routines/renderedVisionClient', () => ({ runRenderedVisionScenario: rendering.run }));
vi.mock('../three/componentMeshes', () => ({ sourcedMeshFiles: rendering.meshes }));
vi.mock('./routineVision', () => ({ prepareRoutineVision: rendering.prepare }));

beforeEach(() => {
  vi.resetAllMocks();
  rendering.prepare.mockResolvedValue({ errors: [], release: rendering.release });
  rendering.meshes.mockResolvedValue({});
  rendering.run.mockResolvedValue({ trace: [], said: [], failures: [], passed: true });
});

describe('rendered Routine environment', () => {
  it('sends the selected imported world to the camera worker with its placement', async () => {
    const imported = { hash: 'a'.repeat(64), position: [100, 0, 200], asset: {} } as ImportedWorldView;
    const model = { xml: '<mujoco />' };
    const sim = { worldParts: [], buildModel: async () => model } as unknown as Simulation;
    const setRun = vi.fn();
    const plan = {} as Plan;
    const scenario = { tier: 'L2' } as Scenario;

    const result = await runRenderedRoutine(plan, scenario, {
      sim,
      scene: { parts: [], cameras: [], imported },
      setRun,
      current: () => true,
    });

    expect(result).toEqual(expect.objectContaining({ started: true, passed: true }));
    expect(rendering.run).toHaveBeenCalledWith(plan, scenario, expect.objectContaining({ imported, model }));
    expect(setRun).toHaveBeenCalledOnce();
    expect(rendering.release).toHaveBeenCalledOnce();
  });

  it('does not publish a cancelled render result into the replacement run', async () => {
    let current = true;
    const sim = { worldParts: [], buildModel: async () => ({ xml: '<mujoco />' }) } as unknown as Simulation;
    const setRun = vi.fn();

    rendering.run.mockImplementation(async () => {
      current = false;

      return { trace: [], said: [], failures: [], passed: true };
    });

    const result = await runRenderedRoutine({} as Plan, { tier: 'L2' } as Scenario, {
      sim,
      scene: { parts: [], cameras: [] },
      setRun,
      current: () => current,
    });

    expect(result).toEqual({ started: false });
    expect(setRun).not.toHaveBeenCalled();
    expect(rendering.release).toHaveBeenCalledOnce();
  });
});
