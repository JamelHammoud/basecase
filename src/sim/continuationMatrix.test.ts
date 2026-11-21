import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, expect, it } from 'vitest';
import { stageCase, stagedEffectors } from '../cases/caseCast';
import { toCommand } from '../cases/caseDrives';
import { worldItem } from '../cases/schema';
import { caseRobot, liveController } from '../cases/testing';
import { encodeRecording } from '../cases/recordingFile';
import { scoreTry, trySignals } from '../cases/tries';
import { sha256Hex } from '../skills/hash';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { TimelineCursor } from '../utils/timelineCursor';
import { readContinuation } from './continuationFile';
import { ContinuationSession } from './continuationSession';
import { SimEngine, type Controller } from './engine';
import type { SimModel } from './mjcfTypes';
import type { FixtureRobot } from './fixtures/parts';
import { CONTINUATION_SCENARIOS, continuationScenario } from './fixtures/continuationScenarios';
import { integrationState } from './integrationState';
import { LivePhysics } from './livePhysics';
import { buildMjcf } from './mjcf';
import { Recorder, frameContacts, type Recording } from './recorder';
import { WorldMoves } from './worldMoves';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

function driveSource(engine: SimEngine, recorder: Recorder, world: WorldMoves, checkpoint: number) {
  let faulted = false;
  let cleared = false;
  let changed = false;
  const id = engine.sim.joints.find((value) => value.actuator >= 0)!.id;

  return () => {
    const time = engine.data.time;

    if (!faulted && time >= checkpoint - 0.2 - 1e-9) {
      engine.setFault(id, 'laggy');
      recorder.fault(id, 'laggy');
      faulted = true;
    }

    if (!cleared && time >= checkpoint + 0.2 - 1e-9) {
      engine.setFault(id, null);
      recorder.fault(id, null);
      cleared = true;
    }

    if (!changed && time >= checkpoint + 0.3 - 1e-9) {
      const change = { id: 'continuation-marker', color: '#ff0000' };

      world.apply(change);
      recorder.worldChange(change);
      changed = true;
    }
  };
}

function maximumDrift(a: ArrayLike<number>, b: ArrayLike<number>) {
  expect(a).toHaveLength(b.length);

  let drift = 0;

  for (let i = 0; i < a.length; i++) drift = Math.max(drift, Math.abs(a[i] - b[i]));

  return drift;
}

function compareRecording(restored: Recording, source: Recording) {
  expect(maximumDrift(restored.qpos, source.qpos)).toBeLessThanOrEqual(1e-10);
  expect(maximumDrift(restored.qvel, source.qvel)).toBeLessThanOrEqual(1e-6);
  expect(maximumDrift(restored.ctrl, source.ctrl)).toBeLessThanOrEqual(1e-6);
  expect(restored.contacts).toEqual(source.contacts);
  expect(restored.contactOffsets).toEqual(source.contactOffsets);
  expect(restored.faults).toEqual(source.faults);
  expect(restored.world).toEqual(source.world);
  expect(restored.t).toEqual(source.t);
}

function continuationPhysics(nominal: SimModel): SimModel {
  const xml = nominal.xml.replace(/<position\s[^>]*>/g, (tag) =>
    tag.includes('delay=') ? tag : tag.replace('<position ', '<position delay="0.006" nsample="16" '),
  );

  return { ...nominal, xml: xml.replace('name="wg_obstacle"', 'name="wg_obstacle" solref="0.02 1"') };
}

function panTiltController(robot: FixtureRobot, model: SimModel): Controller {
  return {
    kind: 'drive',
    setup: {
      kind: 'pose',
      robot: model.robots[0].key,
      joints: robot.joints.map((value) => ({ id: value.id, range: value.range! })),
      start: {},
      rate: 120,
    },
  };
}

it.each(CONTINUATION_SCENARIOS)(
  'continues %s through production WASM with native history, contacts, events and the complete contract',
  async (name) => {
    const { robot, kase, checkpoint } = continuationScenario(name);
    const rig = buildRig(robot.joints, robot.parts);
    const staged = stageCase(kase, { rig, parts: robot.parts }, []);
    const nominal = buildMjcf({
      ...caseRobot(robot),
      rig,
      project: DEFAULT_PROJECT,
      world: staged.kase.world.objects.map(worldItem),
    });
    const model = continuationPhysics(nominal);
    const physics = new LivePhysics();
    const engine = new SimEngine(physics.module(mj), model);
    const world = new WorldMoves(mj, engine);
    const session = new ContinuationSession();
    const controller =
      name === 'pan-tilt target following' ? panTiltController(robot, model) : liveController(robot, rig, model);

    try {
      physics.attach(engine);
      physics.apply(mj, { friction: 0.9, mass: 1.05, strength: 1, latencyMs: 6 });
      engine.setController(controller);

      const recorder = new Recorder(engine, controller, world, {
        caseHash: sha256Hex(JSON.stringify(staged.kase)),
        seconds: staged.kase.task.seconds,
        world,
        physics: () => physics.snapshot(),
      });
      const script = new TimelineCursor(
        staged.kase.reference.timeline,
        (command) => command.at,
        (command) => engine.command(toCommand(command)),
      );

      engine.stepHook = recorder.hook;
      engine.commandHook = recorder.command;
      engine.continuationHook = recorder.continuationHook;
      engine.beforeStepHook = driveSource(engine, recorder, world, checkpoint);

      while (engine.data.time < staged.kase.task.seconds - 1e-9) {
        script.advance(engine.data.time);
        engine.step(0.02);
      }

      const source = recorder.finish();
      const bytes = encodeRecording(source);
      const expected = integrationState(mj, engine.model, engine.data);
      const history = Float64Array.from(engine.data.history);
      const stats = engine.stats();
      const retained = readContinuation(source.continuation!)!;
      const point = retained.checkpoints.find((value) => value.frame === checkpoint * 50)!;
      const scoring = { kase: staged.kase, model, ...stagedEffectors(staged, { rig, parts: robot.parts }) };
      const expectedVerdict = await scoreTry({ ...scoring, recording: source });

      expect(point.engine.faults.kinds).toHaveLength(1);

      if (name !== 'pan-tilt target following') expect(frameContacts(source, point.frame).length).toBeGreaterThan(0);

      if (name === 'spring-return fixture contact') {
        const travel = trySignals({ ...scoring, recording: source }).signals['fixture-travel'];
        const peak = Math.max(...travel);

        expect(peak).toBeGreaterThan(1);
        expect(Math.abs(travel.at(-1)!)).toBeLessThan(peak / 2);
      }

      expect(
        session.start({
          selection: session.select(source),
          frame: point.frame,
          kase: staged.kase,
          engine,
          physics,
          world,
          bytes,
        }),
      ).not.toBeNull();

      const commands = new TimelineCursor(
        source.commands!.slice(point.cursors.commands),
        (command) => command.at,
        (command) => engine.command(command.command),
      );

      while (engine.data.time < staged.kase.task.seconds - 1e-9) {
        commands.advance(engine.data.time);
        engine.step(0.02);
      }

      expect(maximumDrift(integrationState(mj, engine.model, engine.data), expected)).toBeLessThanOrEqual(1e-10);
      expect(maximumDrift(engine.data.history, history)).toBeLessThanOrEqual(1e-10);
      expect(engine.stats()).toEqual(stats);

      const restored = session.finish()!;

      compareRecording(restored, source);
      expect(await scoreTry({ ...scoring, recording: restored })).toEqual(expectedVerdict);
      expect(
        session.start({
          selection: session.select(source),
          frame: point.frame,
          kase: staged.kase,
          engine,
          physics,
          world,
        }),
      ).not.toBeNull();
      engine.command({
        v: [-0.7, 0.2, 0],
        joints: Object.fromEntries(model.joints.filter((value) => value.actuator >= 0).map((value) => [value.id, 10])),
      });
      engine.step(0.3);

      const changed = session.finish()!;

      expect(changed.qpos.subarray(0, (point.frame + 1) * source.nq)).toEqual(
        source.qpos.subarray(0, (point.frame + 1) * source.nq),
      );
      expect(changed.qpos.subarray((point.frame + 1) * source.nq)).not.toEqual(
        source.qpos.subarray((point.frame + 1) * source.nq, changed.frames * source.nq),
      );
      expect(encodeRecording(source)).toEqual(bytes);
    } finally {
      session.select(null);
      engine.dispose();
    }
  },
);
