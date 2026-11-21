import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { worldItem, type WorldObject } from '../cases/schema';
import { decodeRecording, encodeRecording } from '../cases/recordingFile';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig, type V3 } from '../utils/kinematics';
import { SimEngine } from './engine';
import { fixtureMeasures, fixtureTriangles } from './fixtures/parts';
import { fixtureRobots } from './fixtures/robots';
import { buildMjcf } from './mjcf';
import { setRecordedFrame } from './recordedFrames';
import { Recorder } from './recorder';

let mj: MainModule;
const robot = fixtureRobots().find((r) => r.id === 'arm-3dof')!;

beforeAll(async () => {
  mj = await loadMujoco();
});

function person(size: V3 = [500, 1700, 300]): WorldObject {
  const position: V3 = [-1000, size[1] / 2, 0];

  return {
    id: 'person',
    name: 'Person',
    kind: 'box',
    position,
    rotation: [0, 0, 0],
    size,
    behavior: 'static',
    movable: true,
    color: '#888888',
    person: {
      speedMmS: 1000,
      startSeconds: 0.2,
      route: [
        { position, pauseSeconds: 0 },
        { position: [1000, size[1] / 2, 0], pauseSeconds: 0.1 },
      ],
    },
  };
}

function open(object = person()) {
  const model = buildMjcf({
    parts: robot.parts,
    rig: buildRig(robot.joints, robot.parts),
    project: DEFAULT_PROJECT,
    measures: fixtureMeasures(robot.parts),
    partTriangles: fixtureTriangles(robot.parts),
    world: [worldItem(object)],
  });

  return new SimEngine(mj, model);
}

function record(engine: SimEngine, batches: number[]) {
  const recorder = new Recorder(engine);

  engine.stepHook = recorder.hook;

  for (const batch of batches) engine.step(batch);

  engine.stepHook = null;

  return recorder.finish();
}

describe('person motion in the production WASM engine', () => {
  it('emits one mocap identity with six separate collision shapes', () => {
    const engine = open();

    try {
      const body = engine.sim.bodies.find((b) => b.world?.includes('person'))!;
      const id = mj.mj_name2id(engine.model, mj.mjtObj.mjOBJ_BODY.value, body.name);

      expect(engine.model.body_geomnum[id]).toBe(6);
      expect(engine.model.body_mocapid[id]).toBeGreaterThanOrEqual(0);
      expect(body.moves?.person).toEqual(person().person);
      expect(engine.continuation.capture()).toBeNull();
    } finally {
      engine.dispose();
    }
  });

  it.each(
    (
      [
        [400, 1200, 220],
        [500, 1700, 300],
        [700, 2100, 450],
      ] as V3[]
    ).map((size) => ({ size })),
  )('records identical poses, contacts and timestamps across rendering batches for $size', ({ size }) => {
    const live = open(person(size));
    const headless = open(person(size));

    try {
      const a = record(
        live,
        Array.from({ length: 120 }, () => 0.02),
      );
      const b = record(headless, [0.4, 0.8, 0.6, 0.6]);

      expect(a.t).toEqual(b.t);
      expect(a.poses).toEqual(b.poses);
      expect(a.qpos).toEqual(b.qpos);
      expect(a.contacts).toEqual(b.contacts);
      expect(a.contactOffsets).toEqual(b.contactOffsets);
      expect(a.contacts!.length).toBeGreaterThan(0);
    } finally {
      live.dispose();
      headless.dispose();
    }
  });

  it('restores realized person poses from a portable recording without reading edited routes', () => {
    const engine = open();

    try {
      const recording = decodeRecording(encodeRecording(record(engine, [2.4])))!;
      const body = engine.sim.bodies.findIndex((b) => b.world?.includes('person'));
      const frame = 60;

      engine.sim.bodies[body].moves!.person!.route[1].position[0] = 4000;
      engine.reset();
      setRecordedFrame(mj, engine, recording, frame);

      const actual = engine.poses().subarray(body * 7, body * 7 + 7);
      const expected = recording.poses.subarray(
        (frame * recording.nbody + body) * 7,
        (frame * recording.nbody + body + 1) * 7,
      );

      actual.forEach((n, i) => expect(n).toBeCloseTo(expected[i], 6));
    } finally {
      engine.dispose();
    }
  });

  it('restarts motion on reset and refuses script ownership of a declared person', () => {
    const engine = open();

    try {
      const initial = engine.poses();

      engine.step(1);
      expect(engine.world.apply({ id: 'person', pose: { position: [0, 850, 0] } })).toMatch(/route/);
      engine.reset();
      expect(engine.poses()).toEqual(initial);
      expect(record(engine, [0.5]).poses).toEqual(recordAfterReset(engine));
    } finally {
      engine.dispose();
    }
  });
});

function recordAfterReset(engine: SimEngine) {
  engine.reset();

  return record(engine, [0.5]).poses;
}
