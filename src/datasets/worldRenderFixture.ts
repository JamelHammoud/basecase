import { readWorldFiles } from '../cases/worldImport';
import { kitchenCollider, kitchenSplat } from '../cases/worldImportFixture';
import { worldComponents } from '../cases/worldComponents';
import type { ImportedWorldView } from '../three/viewport/importedWorld';
import type { Recording } from '../sim/recorder';
import type { SimModel } from '../sim/mjcfTypes';
import { sceneCamera, type DatasetCamera } from './cameras';

export const kitchenCameras: DatasetCamera[] = [
  {
    ...sceneCamera([], []),
    position: [0, 1800, 3500],
    target: [0, 500, 800],
    up: [0, 1, 0],
    fovDeg: 60,
    lens: { model: 'pinhole', hfovDeg: 80 },
  },
  {
    ...sceneCamera([], []),
    key: 'overhead',
    position: [0, 1800, 1200],
    target: [0, 800, 1200],
    up: [0, 0, -1],
    fovDeg: 60,
    lens: { model: 'pinhole', hfovDeg: 70 },
  },
];

export async function kitchenView(splat = true): Promise<ImportedWorldView> {
  const world = await readWorldFiles(splat ? [kitchenCollider(), kitchenSplat()] : [kitchenCollider()]);

  if (world.kind !== 'mesh') throw new Error('Expected the kitchen mesh.');

  return {
    hash: splat ? 'kitchen-splat' : 'kitchen-mesh',
    asset: { world, pieces: worldComponents(world.mesh, 64) },
    position: [0, 0, 0],
  };
}

export function stationaryEpisode(frames = 5): { model: SimModel; recording: Recording } {
  return {
    model: { version: 1, xml: '', bodies: [], joints: [], robots: [], initial: { values: {} }, massKg: {} },
    recording: {
      dt: 0.02,
      frames,
      nq: 0,
      nv: 0,
      nu: 0,
      nbody: 0,
      t: Float32Array.from({ length: frames }, (_, i) => i * 0.02),
      ctrl: new Float32Array(),
      qpos: new Float64Array(),
      qvel: new Float32Array(),
      poses: new Float32Array(),
      jointQpos: new Int32Array(),
    },
  };
}
