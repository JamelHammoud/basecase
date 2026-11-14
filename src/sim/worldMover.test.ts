import loadMujoco from '@mujoco/mujoco';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { SimEngine } from './engine';
import { buildMjcf, worldDeltas } from './mjcf';
import type { WorldItem } from './mjcfTypes';
import { Recorder } from './recorder';
import { WorldMover } from './worldMover';

const item = (id: string, behavior: WorldItem['behavior'], position: [number, number, number], movable = true) =>
  ({
    id,
    name: id,
    kind: 'box',
    category: 'structure',
    role: 'solid',
    position,
    rotation: [0, 0, 0],
    dimensions: { width: 60, height: 60, depth: 60 },
    color: '#888888',
    note: '',
    visible: true,
    locked: true,
    behavior,
    ...(movable ? { movable: true } : {}),
  }) satisfies WorldItem;

const world = [
  item('target', 'marker', [200, 1, 0]),
  item('wall', 'static', [0, 30, 0]),
  item('box', 'dynamic', [0, 300, 0]),
  item('post', 'static', [400, 30, 0], false),
];

const model = () =>
  buildMjcf({
    parts: [],
    rig: buildRig([], []),
    project: DEFAULT_PROJECT,
    measures: {},
    partTriangles: () => null,
    world,
  });

const placed = (engine: SimEngine, id: string) => {
  const rest = world.find((w) => w.id === id)!.position;
  const delta = worldDeltas(engine.sim, engine.poses()).get(id)!;

  return new THREE.Vector3(...rest)
    .applyMatrix4(delta)
    .toArray()
    .map((x) => Math.round(x));
};

async function start() {
  const mj = await loadMujoco();
  const engine = new SimEngine(mj, model());

  return { engine, mover: new WorldMover(mj, engine) };
}

describe('moving a Case’s world in the sim', () => {
  it('compiles movable static objects as mocap bodies and lists every movable object', () => {
    const sim = model();

    expect(sim.xml).toMatch(/<body name="w0_target"[^>]*mocap="true"/);
    expect(sim.xml).toMatch(/<body name="w1_wall"[^>]*mocap="true"/);
    expect(sim.xml).not.toMatch(/<body name="w3_post"[^>]*mocap/);
    expect(sim.movable?.map((m) => m.id)).toEqual(['target', 'wall', 'box']);
  });

  it('moves a mocap body, teleports a dynamic one at rest, and refuses an object that isn’t movable', async () => {
    const { engine, mover } = await start();

    expect(mover.apply({ id: 'target', position: [100, 1, 50], color: '#ff5a1f' })).toBe(true);
    expect(mover.apply({ id: 'box', position: [100, 400, 0] })).toBe(true);
    expect(mover.apply({ id: 'post', position: [0, 0, 0] })).toBe(false);
    expect(placed(engine, 'target')).toEqual([100, 1, 50]);
    expect(placed(engine, 'box')).toEqual([100, 400, 0]);
    expect(Array.from(engine.data.qvel.slice(0, 6))).toEqual([0, 0, 0, 0, 0, 0]);
    expect(mover.looks().target).toEqual({ visible: true, color: '#ff5a1f' });

    engine.step(0.5);

    expect(placed(engine, 'target')).toEqual([100, 1, 50]);
    engine.dispose();
  });

  it('hides a wall so nothing touches it, and a hidden box floats until it’s shown', async () => {
    const { engine, mover } = await start();

    mover.apply({ id: 'wall', visible: false });
    mover.apply({ id: 'box', visible: false });
    engine.step(0.5);

    expect(engine.model.geom_contype[engine.model.ngeom - 3]).toBe(0);
    expect(placed(engine, 'box')[1]).toBeGreaterThan(295);
    expect(mover.looks().wall.visible).toBe(false);

    mover.apply({ id: 'box', visible: true });
    engine.step(1);

    expect(placed(engine, 'box')[1]).toBeLessThan(100);
    engine.dispose();
  });

  it('puts the world back on reset and replays recorded changes up to a time', async () => {
    const { engine, mover } = await start();
    const recorder = new Recorder(engine);

    mover.apply({ id: 'target', position: [0, 1, 200], visible: false });
    recorder.world(mover.current()[0]);
    mover.reset();
    engine.reset();

    expect(placed(engine, 'target')).toEqual([200, 1, 0]);
    expect(mover.looks().target.visible).toBe(true);

    mover.replay([{ at: 0.2, change: { id: 'target', position: [0, 1, 200] } }], 0.1);
    expect(placed(engine, 'target')).toEqual([200, 1, 0]);
    mover.replay([{ at: 0.2, change: { id: 'target', position: [0, 1, 200] } }], 0.2);
    expect(placed(engine, 'target')).toEqual([0, 1, 200]);
    expect(recorder.finish().world).toEqual([
      { at: 0, change: { id: 'target', position: [0, 1, 200], visible: false } },
    ]);
    engine.dispose();
  });
});
