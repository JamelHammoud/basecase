import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, expect, it } from 'vitest';
import { touchTheDots } from '../cases/testing';
import { worldItem, type WorldObject } from '../cases/schema';
import { encodeRecording } from '../cases/recordingFile';
import { sha256Hex } from '../skills/hash';
import { ContinuationSession } from './continuationSession';
import { SimEngine } from './engine';
import { contactSliders } from './fixtures/contactRobots';
import { fixtureRobots } from './fixtures/robots';
import { integrationState } from './integrationState';
import { LivePhysics } from './livePhysics';
import { Recorder, type Recording } from './recorder';
import { WorldMoves } from './worldMoves';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

function setup() {
  const kase = touchTheDots(fixtureRobots().find((r) => r.id === 'arm-3dof')!);
  const physics = new LivePhysics();
  const block: WorldObject = {
    id: 'block',
    name: 'Block',
    kind: 'box',
    position: [39.8, 20, 0],
    rotation: [0, 0, 0],
    size: [40, 40, 40],
    color: '#888888',
    behavior: 'static',
    movable: true,
  };
  const model = contactSliders(1, [worldItem(block)]);
  const engine = new SimEngine(physics.module(mj), {
    ...model,
    xml: model.xml.replace('<position ', '<position delay="0.006" nsample="16" '),
  });
  const world = new WorldMoves(mj, engine);
  const controller = {
    kind: 'drive' as const,
    setup: {
      kind: 'pose' as const,
      robot: engine.sim.robots[0].key,
      joints: [{ id: 'slider0', range: [-90, 90] as [number, number] }],
      start: {},
      rate: 240,
    },
  };

  physics.attach(engine);
  engine.setController(controller);
  engine.command({ v: [0, 0, 0], joints: { slider0: 4 } });

  const recorder = new Recorder(engine, controller, world, {
    caseHash: sha256Hex(JSON.stringify(kase)),
    seconds: kase.task.seconds,
    world,
    physics: () => physics.snapshot(),
  });

  engine.stepHook = recorder.hook;
  engine.commandHook = recorder.command;
  engine.continuationHook = recorder.continuationHook;
  engine.step(0.8);
  engine.setFault('slider0', 'laggy');
  recorder.fault('slider0', 'laggy');
  engine.step(0.4);
  engine.setFault('slider0', null);
  recorder.fault('slider0', null);
  engine.step(0.06);
  world.apply({ id: 'block', color: '#ff0000' });
  recorder.worldChange({ id: 'block', color: '#ff0000' });
  engine.step(0.14);

  const source = recorder.finish();

  engine.stepHook = null;
  engine.commandHook = null;
  engine.continuationHook = null;

  return { kase, engine, physics, world, source };
}

it('restores a source-bound checkpoint, keeps fault timing, splices a changed suffix and leaves source bytes intact', () => {
  const { kase, engine, physics, world, source } = setup();
  const session = new ContinuationSession();
  const unchanged = encodeRecording(source);

  try {
    const selection = session.select(source);
    const points = session.points();

    expect(points.map((p) => p.frame)).toEqual([0, 50]);

    const result = session.start({ selection, frame: 50, kase, engine, world, physics });

    expect(result).not.toBeNull();
    expect(result!.branch.time).toBeCloseTo(1, 8);
    expect(result!.deadline).toBe(kase.task.seconds);
    expect(engine.stats().joints[0].fault).toBe('laggy');
    engine.command({ v: [0, 0, 0], joints: { slider0: -3 } });
    engine.step(0.1);
    expect(engine.stats().joints[0].fault).toBe('laggy');
    engine.step(0.2);
    expect(engine.stats().joints[0].fault).toBeUndefined();

    const recording = session.finish()!;

    expect(recording.frames).toBe(66);
    expect(recording.t.at(-1)).toBeCloseTo(1.3, 5);
    expect(recording.qpos.subarray(0, 51 * source.nq)).toEqual(source.qpos.subarray(0, 51 * source.nq));
    expect(recording.qpos.subarray(51 * source.nq)).not.toEqual(source.qpos.subarray(51 * source.nq, 66 * source.nq));
    expect(recording.faults).toEqual(source.faults);
    expect(encodeRecording(source)).toEqual(unchanged);
    expect(engine.beforeStepHook).toBeNull();
    expect(engine.stepHook).toBeNull();
  } finally {
    session.cancel();
    engine.dispose();
  }
});

it('refuses stale selections, Case edits, legacy bytes and model edits before mutating physics', () => {
  const { kase, engine, physics, world, source } = setup();
  const session = new ContinuationSession();
  const before = integrationState(mj, engine.model, engine.data);
  const request = { frame: 50, kase, engine, world, physics };

  try {
    const stale = session.select(source);
    const selection = session.select(source);

    expect(session.start({ ...request, selection: stale })).toBeNull();
    expect(session.start({ ...request, selection, kase: { ...kase, name: 'Edited' } })).toBeNull();
    expect(integrationState(mj, engine.model, engine.data)).toEqual(before);

    for (const continuation of [undefined, new Uint8Array([123, 125]), new Uint8Array([255])]) {
      const legacy = session.select({ ...source, continuation });

      expect(session.points()).toEqual([]);
      expect(session.start({ ...request, selection: legacy })).toBeNull();
    }

    const incompatible = structuredClone(source);

    incompatible.continuation = new TextEncoder().encode(
      new TextDecoder().decode(source.continuation).replace(/"modelVersion":\d+/g, '"modelVersion":0'),
    );
    expect(session.start({ ...request, selection: session.select(incompatible) })).toBeNull();
    expect(integrationState(mj, engine.model, engine.data)).toEqual(before);
  } finally {
    engine.dispose();
  }
});

it('cancels an active branch on selection changes without retaining hooks or changing its source', () => {
  const { kase, engine, physics, world, source } = setup();
  const session = new ContinuationSession();
  const unchanged = encodeRecording(source);

  try {
    const selection = session.select(source);

    expect(session.start({ selection, frame: 50, kase, engine, world, physics })).not.toBeNull();
    engine.step(0.02);
    session.select(null);
    expect(session.finish()).toBeNull();
    expect(session.points()).toEqual([]);
    expect(engine.beforeStepHook).toBeNull();
    expect(engine.commandHook).toBeNull();
    expect(engine.stepHook).toBeNull();
    expect(encodeRecording(source)).toEqual(unchanged);
  } finally {
    session.cancel();
    engine.dispose();
  }
});

it('refuses ambiguous cross-channel event order and unsupported inputs before takeover', () => {
  const { kase, engine, physics, world, source } = setup();
  const session = new ContinuationSession();
  const variants: Recording[] = [
    { ...source, inputs: [{ at: 1.1, name: 'code', value: true }] },
    { ...source, world: [{ at: 1.2, id: 'object', visible: false }] },
  ];

  try {
    for (const recording of variants) {
      const selection = session.select(recording);

      expect(session.start({ selection, frame: 50, kase, engine, world, physics })).toBeNull();
    }
  } finally {
    engine.dispose();
  }
});

it('matches uninterrupted delayed contact physics, actuator history and world-event timing under identical controls', () => {
  const { kase, engine, physics, world, source } = setup();
  const session = new ContinuationSession();
  const expected = integrationState(mj, engine.model, engine.data);
  const expectedStats = engine.stats();
  const selection = session.select(source);

  try {
    expect(session.start({ selection, frame: 50, kase, engine, physics, world })).not.toBeNull();
    expect(engine.data.ncon).toBeGreaterThan(0);
    expect(world.looks()).toEqual({});
    engine.step(0.26);
    expect(world.looks()).toEqual({});
    engine.step(0.14);
    expect(world.looks()).toEqual({ block: { color: '#ff0000' } });
    expect(integrationState(mj, engine.model, engine.data)).toEqual(expected);
    expect(engine.stats()).toEqual(expectedStats);

    const recording = session.finish()!;

    expect(recording.qpos).toEqual(source.qpos);
    expect(recording.qvel).toEqual(source.qvel);
    expect(recording.ctrl).toEqual(source.ctrl);
    expect(recording.contacts).toEqual(source.contacts);
    expect(recording.contactOffsets).toEqual(source.contactOffsets);
    expect(recording.world).toEqual(source.world);
    expect(recording.faults).toEqual(source.faults);
  } finally {
    session.cancel();
    engine.dispose();
  }
});
