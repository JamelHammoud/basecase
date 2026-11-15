import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sha256 } from '../cases/tries';
import type { StoredTry } from '../cases/tryFile';
import type { SimModel } from '../sim/mjcfTypes';
import type { Simulation } from '../sim/useSimulation';
import { fixtureRobots } from '../sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { loadFrameLabelScene } from './frameLabelScene';

const mocks = vi.hoisted(() => ({ load: vi.fn(), build: vi.fn(), meshes: vi.fn(async () => ({})) }));

vi.mock('../utils/sceneRecords', () => ({ loadSceneRecord: mocks.load }));
vi.mock('../vision/trySceneClient', () => ({ buildTryScene: mocks.build }));
vi.mock('../three/componentMeshes', () => ({ sourcedMeshFiles: mocks.meshes }));

async function fixture() {
  const robot = fixtureRobots()[0];
  const rig = buildRig(robot.joints, robot.parts);
  const model = { xml: '<mujoco/>', bodies: [], joints: [], robots: [] } as unknown as SimModel;
  const stored: StoredTry = {
    version: 1,
    id: 'try',
    sceneId: 'scene',
    robot: { name: 'Robot', modelHash: await sha256(model.xml), joints: [] },
    case: null,
    source: 'case',
    input: null,
    startedAt: '',
    seconds: 1,
    rate: 50,
    frames: 50,
    outcome: { verdict: 'passed', margin: 1 },
    seed: 0,
    sourceTry: null,
    faults: [],
  };
  const sim = {
    modelNow: () => model,
    worldParts: [],
    guestParts: [],
    worldNow: () => ({ items: [], guests: { parts: [], joints: [] } }),
  } as unknown as Simulation;
  const current = {
    sceneId: 'scene',
    parts: robot.parts,
    project: DEFAULT_PROJECT,
    rig,
    sim,
    cases: [],
    partners: () => [],
  };

  return { stored, current, model };
}

beforeEach(() => vi.clearAllMocks());

describe('frame label scene sources', () => {
  it('uses the loaded matching model and actual simulation world', async () => {
    const { stored, current, model } = await fixture();
    const world = [{ ...current.parts[0], id: 'world', color: '#123456' }];

    current.sim.worldParts = world as Simulation['worldParts'];

    const scene = await loadFrameLabelScene(stored, current);

    expect(scene.model).toBe(model);
    expect(scene.world).toEqual(world);
    expect(mocks.build).not.toHaveBeenCalled();
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it('opens the try source scene before rebuilding instead of using another tab', async () => {
    const { stored, current, model } = await fixture();
    const record = { name: 'Saved robot', parts: current.parts, project: DEFAULT_PROJECT };
    const rebuilt = { parts: current.parts, world: [], model, views: [], rig: current.rig };

    mocks.load.mockResolvedValue(record);
    mocks.build.mockResolvedValue(rebuilt);

    const scene = await loadFrameLabelScene({ ...stored, sceneId: 'other' }, current);

    expect(mocks.load).toHaveBeenCalledWith('other');
    expect(mocks.build).toHaveBeenCalledWith(expect.objectContaining({ scene: record }));
    expect(scene.model).toBe(model);
  });

  it('refuses a changed source model and a missing source scene', async () => {
    const { stored, current, model } = await fixture();

    mocks.load.mockResolvedValue(null);
    await expect(loadFrameLabelScene({ ...stored, sceneId: 'missing' }, current)).rejects.toThrow(/scene/);
    mocks.build.mockResolvedValue({ parts: [], world: [], views: [], model: { ...model, xml: 'edited' } });
    current.sim = { ...current.sim, modelNow: () => null };
    await expect(loadFrameLabelScene(stored, current)).rejects.toThrow(/changed/);
  });
});
