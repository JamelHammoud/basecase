import loadMujoco from '@mujoco/mujoco';
import { expect, it } from 'vitest';
import { worldItem, type WorldObject } from '../cases/schema';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { SimEngine } from './engine';
import { fixtureRobots } from './fixtures/robots';
import { integrationState, restoreIntegrationState } from './integrationState';
import { buildMjcf } from './mjcf';
import { WorldMoves } from './worldMoves';

const crate: WorldObject = {
  id: 'crate',
  name: 'Crate',
  kind: 'box',
  position: [200, 40, 0],
  rotation: [0, 0, 0],
  size: [40, 40, 40],
  color: '#888888',
  behavior: 'dynamic',
  massG: 100,
  movable: true,
};

it('continues hidden-world poses and collision settings through a later show event', async () => {
  const mj = await loadMujoco();
  const robot = fixtureRobots().find((fixture) => fixture.id === 'arm-3dof')!;
  const model = buildMjcf({
    parts: robot.parts,
    rig: buildRig(robot.joints, robot.parts),
    project: DEFAULT_PROJECT,
    measures: {},
    partTriangles: () => null,
    world: [worldItem(crate), worldItem({ ...crate, id: 'marker', behavior: 'marker' })],
  });
  const original = new SimEngine(mj, model);
  const restored = new SimEngine(mj, model);
  const world = new WorldMoves(mj, original);
  const continued = new WorldMoves(mj, restored);

  try {
    original.step(0.04);
    world.apply({ id: 'crate', visible: false, color: '#ff0000' });
    world.apply({ id: 'marker', pose: { position: [100, 50, 20], rotation: [0, 45, 0] } });
    original.step(0.1);

    const state = world.snapshot();
    const unchanged = structuredClone(state);
    const physics = integrationState(mj, original.model, original.data);

    continued.restore(state);
    expect(restoreIntegrationState({ mj, model: restored.model, data: restored.data }, physics)).toBe(true);
    expect(continued.looks()).toEqual(world.looks());
    expect(restored.model.geom_contype).toEqual(original.model.geom_contype);
    expect(restored.model.geom_conaffinity).toEqual(original.model.geom_conaffinity);
    expect(restored.model.geom_rgba).toEqual(original.model.geom_rgba);
    world.apply({ id: 'crate', visible: true });
    continued.apply({ id: 'crate', visible: true });
    expect(restored.data.qpos).toEqual(original.data.qpos);

    for (let tick = 0; tick < 50; tick++) {
      original.step(original.dt);
      restored.step(restored.dt);
      expect(restored.data.qpos).toEqual(original.data.qpos);
      expect(restored.data.qvel).toEqual(original.data.qvel);
      expect(restored.contactPairs()).toEqual(original.contactPairs());
    }

    expect(state).toEqual(unchanged);
  } finally {
    original.dispose();
    restored.dispose();
  }
});
