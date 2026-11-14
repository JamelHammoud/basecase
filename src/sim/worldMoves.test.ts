import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { worldItem, type WorldObject } from '../cases/schema';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig, type V3 } from '../utils/kinematics';
import { SimEngine } from './engine';
import { fixtureMeasures, fixtureTriangles } from './fixtures/parts';
import { fixtureRobots } from './fixtures/robots';
import { buildMjcf } from './mjcf';
import { worldDeltas } from './mjcfFrames';
import { Recorder } from './recorder';
import { WorldMoves } from './worldMoves';

const arm = fixtureRobots().find((r) => r.id === 'arm-3dof')!;

const object = (id: string, o: Partial<WorldObject>): WorldObject => ({
  id,
  name: id,
  kind: 'box',
  position: [0, 10, 0],
  rotation: [0, 0, 0],
  size: [40, 20, 40],
  color: '#888888',
  behavior: 'static',
  ...o,
});

const WORLD: WorldObject[] = [
  object('target', { behavior: 'marker', position: [150, 1, 0], size: [40, 2, 40], movable: true }),
  object('crate', { behavior: 'dynamic', position: [0, 20, 200], size: [40, 40, 40], massG: 200, movable: true }),
  object('gate', { position: [-200, 50, 0], size: [20, 100, 200], movable: true }),
  object('wall', { position: [0, 50, -250], size: [300, 100, 20] }),
];

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
}, 60000);

function open(world: WorldObject[] = WORLD) {
  const rig = buildRig(arm.joints, arm.parts);
  const model = buildMjcf({
    parts: arm.parts,
    rig,
    project: DEFAULT_PROJECT,
    measures: fixtureMeasures(arm.parts),
    partTriangles: fixtureTriangles(arm.parts),
    world: world.map(worldItem),
  });
  const engine = new SimEngine(mj, model);

  return { model, engine, moves: new WorldMoves(mj, engine) };
}

function at(opened: ReturnType<typeof open>, id: string): V3 {
  const rest = WORLD.find((o) => o.id === id)!.position;
  const delta = worldDeltas(opened.model, opened.engine.poses()).get(id) ?? new THREE.Matrix4();

  return new THREE.Vector3(...rest).applyMatrix4(delta).toArray();
}

const near = (a: V3, b: V3, mm = 0.5) => a.every((x, i) => Math.abs(x - b[i]) <= mm);

describe('movable world objects', () => {
  it('writes movable static objects as mocap bodies and leaves the rest as they were', () => {
    const { model, engine } = open();
    const body = (id: string) => model.xml.split('\n').find((l) => l.includes('<body') && l.includes(`_${id}"`))!;

    expect(body('target')).toContain('mocap="true"');
    expect(body('gate')).toContain('mocap="true"');
    expect(body('crate')).not.toContain('mocap');
    expect(body('wall')).not.toContain('mocap');
    expect(model.xml).toContain('<freejoint name="w1_crate"/>');
    expect(model.bodies.find((b) => b.world?.[0] === 'wall')?.moves).toBeUndefined();
    engine.dispose();
  });

  it('moves and turns a mocap target, and probes read it where it went', () => {
    const opened = open();
    const { engine, moves, model } = opened;

    expect(moves.apply({ id: 'target', pose: { position: [-120, 1, 90], rotation: [0, 90, 0] } })).toBeNull();
    engine.step(0.1);
    expect(near(at(opened, 'target'), [-120, 1, 90])).toBe(true);

    const turn = new THREE.Quaternion().setFromRotationMatrix(worldDeltas(model, engine.poses()).get('target')!);

    expect(turn.angleTo(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)))).toBeLessThan(1e-4);
    engine.dispose();
  });

  it('teleports a dynamic crate with zero velocity, where it then rests', () => {
    const opened = open();
    const { engine, moves } = opened;

    moves.apply({ id: 'crate', pose: { position: [120, 20, 220] } });
    expect(Array.from(engine.data.qvel).every((v, i) => i < engine.data.qvel.length - 6 || v === 0)).toBe(true);
    engine.step(1);
    expect(near(at(opened, 'crate'), [120, 20, 220], 3)).toBe(true);
    engine.dispose();
  });

  it('refuses a fixed object, a robot part and an unknown name', () => {
    const { engine, moves } = open();

    expect(moves.apply({ id: 'wall', pose: { position: [0, 50, 0] } })).toBe('wall isn’t movable');
    expect(moves.apply({ id: arm.parts[0].id, pose: { position: [0, 0, 0] } })).toBe(
      `${arm.parts[0].id} isn’t in the Case’s world`,
    );
    expect(moves.apply({ id: 'ghost', visible: false })).toBe('ghost isn’t in the Case’s world');
    expect(moves.looks()).toEqual({});
    engine.dispose();
  });

  it('hides a gate so a crate passes through, and shows it again', () => {
    const opened = open();
    const { engine, moves, model } = opened;
    const gate = model.bodies.findIndex((b) => b.world?.[0] === 'gate');

    moves.apply({ id: 'gate', visible: false, color: '#ff0000' });
    expect(moves.looks()).toEqual({ gate: { visible: false, color: '#ff0000' } });
    expect(engine.model.geom_conaffinity[engine.model.body_geomadr[gate + 1]]).toBe(0);
    moves.apply({ id: 'gate', visible: true });
    expect(moves.looks()).toEqual({ gate: { color: '#ff0000' } });
    expect(engine.model.geom_conaffinity[engine.model.body_geomadr[gate + 1]]).toBe(1);
    engine.dispose();
  });

  it('puts every object back on reset, and replays changes up to a time', () => {
    const opened = open();
    const { engine, moves, model } = opened;
    const geom = engine.model.body_geomadr[model.bodies.findIndex((b) => b.world?.[0] === 'target') + 1];
    const authored = Array.from(engine.model.geom_rgba.subarray(geom * 4, geom * 4 + 4));

    moves.apply({ id: 'target', pose: { position: [-120, 1, 90] }, color: '#00ff00' });
    engine.reset();
    moves.reset();
    expect(near(at(opened, 'target'), [150, 1, 0])).toBe(true);
    expect(moves.looks()).toEqual({});
    expect(Array.from(engine.model.geom_rgba.subarray(geom * 4, geom * 4 + 4))).toEqual(authored);

    moves.replay(
      [
        { at: 0.5, id: 'target', pose: { position: [0, 1, 150] } },
        { at: 2, id: 'target', color: '#ff0000' },
      ],
      1,
    );
    expect(near(at(opened, 'target'), [0, 1, 150])).toBe(true);
    expect(moves.looks()).toEqual({});
    engine.dispose();
  });

  it('records each change at the try’s time, and the world as it stood when the try began', () => {
    const { engine, moves } = open();

    moves.apply({ id: 'target', color: '#00ff00' });
    moves.apply({ id: 'crate', pose: { position: [120, 20, 220] } });

    const recorder = new Recorder(engine, { kind: 'hold' }, moves);

    engine.stepHook = recorder.hook;
    engine.step(0.5);
    moves.apply({ id: 'gate', visible: false });
    recorder.worldChange({ id: 'gate', visible: false });

    const recording = recorder.finish();

    expect(recording.world?.[0]).toEqual({ at: 0, id: 'target', color: '#00ff00' });
    expect(recording.world?.some((e) => e.id === 'crate')).toBe(false);
    expect(recording.world?.[1].id).toBe('gate');
    expect(recording.world?.[1].at).toBeCloseTo(0.5, 2);
    engine.dispose();
  });
});
