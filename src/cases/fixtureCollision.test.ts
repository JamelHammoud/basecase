import { expect, it } from 'vitest';
import loadMujoco from '@mujoco/mujoco';
import { box } from '../sim/fixtures/parts';
import { emitWorld } from '../sim/mjcfWorld';
import { preparedWorldItems } from './fixtureCollision';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import type { WorldItem } from '../sim/mjcfTypes';

function emittedWorld(world: WorldItem[]) {
  return emitWorld(
    { parts: [], rig: buildRig([], []), project: DEFAULT_PROJECT, measures: {}, partTriangles: () => null, world },
    0,
  );
}

it('prepares imported geometry in the existing collision worker and emits its rotated hull instead of its bounding box', async () => {
  const part = {
    ...box('tetrahedron', [40, 30, 20], [20, 20, 20], 10),
    kind: 'mesh' as const,
    mesh: {
      positions: [-10, -10, -10, 10, -10, -10, -10, 10, -10, -10, -10, 10],
      indices: [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3],
      baseSize: [20, 20, 20] as [number, number, number],
    },
    rotation: [0, 90, 0] as [number, number, number],
    behavior: 'dynamic' as const,
  };
  const world = await preparedWorldItems([part]);
  const result = emittedWorld(world);

  expect(world[0].collisionHulls?.length).toBeGreaterThan(0);
  expect(result.assets.join('')).toContain('<mesh');
  expect(result.lines.join('')).toContain('type="mesh"');
  expect(result.lines.join('')).not.toContain('type="box"');
  expect(part.mesh.positions).toEqual([-10, -10, -10, 10, -10, -10, -10, 10, -10, -10, -10, 10]);
});

it('retains sub-gram mass in MuJoCo across the maximum collision hull count', async () => {
  const hull = new Float32Array([-10, -10, -10, 10, -10, -10, -10, 10, -10, -10, -10, 10]);
  const result = emittedWorld([
    {
      ...box('fixture', [0, 30, 0], [20, 20, 20], 0.1),
      behavior: 'dynamic',
      collisionHulls: Array.from({ length: 64 }, () => hull),
    },
  ]);
  const mj = await loadMujoco();
  const model = mj.MjModel.from_xml_string(
    `<mujoco><asset>${result.assets.join('')}</asset><worldbody>${result.lines.join('')}</worldbody></mujoco>`,
  );

  try {
    expect(model.ngeom).toBe(64);
    expect(model.body_mass[1]).toBeCloseTo(0.0001, 12);
  } finally {
    model.delete();
  }
});
