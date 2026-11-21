import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, expect, it } from 'vitest';
import { decodeRecording, encodeRecording } from '../cases/recordingFile';
import { fixtureModel, fixtureRobot } from '../skills/fixtureModels';
import { buildRig } from '../utils/kinematics';
import { type ArmSetup } from './drive';
import { driveAccess } from './driveAccess';
import { SimEngine } from './engine';
import { obsSize, POLICY_FORMAT, POLICY_VERSION, type PolicySpec } from './policy';
import { Recorder } from './recorder';
import { correctionEpisode, demoEpisode } from '../datasets/demos';
import { sampleRecording } from '../datasets/snapshotRecording';
import { LivePhysics } from './livePhysics';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

function session(module = mj) {
  const robot = fixtureRobot('arm-3dof');
  const model = fixtureModel(robot.id);
  const access = driveAccess({ rig: buildRig(robot.joints, robot.parts), parts: robot.parts, model });

  if (access.kind !== 'ready' || access.setup.kind !== 'arm') throw new Error('Expected an arm drive.');

  const joints = model.joints.filter((joint) => joint.actuator >= 0).map((joint) => joint.id);
  const size = obsSize(joints.length);
  const w = Array<number>(size * joints.length).fill(0);

  joints.forEach((_, i) => (w[i * size + 12 + 2 * joints.length + i] = 0.5));

  const policy: PolicySpec = {
    format: POLICY_FORMAT,
    version: POLICY_VERSION,
    task: 'stand',
    robot: model.robots[0].key,
    joints,
    defaultPose: joints.map(() => 0),
    actionScale: 1,
    controlDt: 0.04,
    command: [0, 0, 0],
    obsMean: Array<number>(size).fill(0),
    obsStd: Array<number>(size).fill(1),
    layers: [{ in: size, out: joints.length, w, b: joints.map(() => 0.1) }],
    activation: 'elu',
    trainedSteps: 1,
    mujoco: '4.0.0',
    createdAt: '2026-11-20T00:00:00Z',
  };
  const engine = new SimEngine(module, model);
  const controller = { kind: 'policy' as const, policy, robot: policy.robot };

  engine.setController(controller);

  return { engine, setup: access.setup, policy, controller };
}

it('records delayed actions with their originating owner and resumes from the action actually applied', () => {
  const physics = new LivePhysics();
  const { engine, setup, controller } = session(physics.module(mj));

  try {
    physics.attach(engine);
    physics.apply(mj, { mass: 1, strength: 1, friction: 1, latencyMs: 6 });
    engine.startTeaching(setup);

    const recorder = new Recorder(engine, controller);

    engine.stepHook = recorder.hook;
    engine.controlHook = recorder.control;
    engine.step(0.04);
    engine.handoff('operator');
    engine.command({ v: [0, 0, 0], joints: { [controller.policy.joints[0]]: 20 } });
    engine.step(0.02);
    engine.handoff('policy');
    engine.step(0.02);

    const recording = recorder.finish();
    const first = Math.round(0.04 / engine.dt);
    const last = Math.round(0.06 / engine.dt);

    expect(Array.from(recording.actionOwner!.slice(first, first + 3))).toEqual([0, 0, 0]);
    expect(recording.actionOwner![first + 3]).toBe(1);
    expect(Array.from(recording.actionOwner!.slice(last, last + 3))).toEqual([1, 1, 1]);
    expect(recording.actionOwner![last + 3]).toBe(0);
    expect(recording.actionPrevious![last * recording.nu]).toBeCloseTo((20 * Math.PI) / 180, 6);
    expect(recording.actionCtrl![(last + 3) * recording.nu]).toBeCloseTo((10 * Math.PI) / 180 + 0.1, 6);
  } finally {
    engine.dispose();
  }
});

it.each([false, true])(
  'keeps controls queued before teaching as context, including an earlier session (%s)',
  (previousTeaching) => {
    const physics = new LivePhysics();
    const { engine, setup, controller } = session(physics.module(mj));

    try {
      physics.attach(engine);
      physics.apply(mj, { mass: 1, strength: 1, friction: 1, latencyMs: 6 });

      if (previousTeaching) engine.startTeaching(setup);

      engine.step(0.02);

      const previous = Float32Array.from(engine.data.ctrl);

      engine.setController(controller);
      engine.startTeaching(setup);
      engine.handoff('operator');

      const recorder = new Recorder(engine, controller);

      engine.stepHook = recorder.hook;
      engine.controlHook = recorder.control;
      engine.command({ v: [0, 0, 0], joints: { [controller.policy.joints[0]]: 20 } });
      engine.step(0.02);

      const recording = recorder.finish();

      expect(Array.from(recording.actionOwner!.slice(0, 3))).toEqual([2, 2, 2]);
      expect(recording.actionOwner![3]).toBe(1);
      expect(recording.actionPrevious!.slice(0, recording.nu)).toEqual(previous);
      expect(decodeRecording(encodeRecording(recording))).toEqual(recording);
      expect(correctionEpisode(recording, engine.sim, { from: 0, to: recording.frames }).actions[0][0]).toBeCloseTo(
        (20 * Math.PI) / 180,
        6,
      );
    } finally {
      engine.dispose();
    }
  },
);

it('preserves the first correction when a selected frame time rounds above its control boundary', () => {
  const { engine, setup, controller } = session();

  try {
    engine.startTeaching(setup);

    const recorder = new Recorder(engine, controller);

    engine.stepHook = recorder.hook;
    engine.controlHook = recorder.control;
    engine.step(0.3);
    engine.handoff('operator');
    engine.step(0.08);

    const full = recorder.finish();
    const clipped = sampleRecording(full, { from: 15, to: full.frames });

    expect(full.t[15]).toBeGreaterThan(0.3);
    expect(clipped.actionTime![0]).toBe(0);
    expect(clipped.actionOwner![0]).toBe(1);
    expect(decodeRecording(encodeRecording(clipped))).toEqual(clipped);
    expect(correctionEpisode(clipped, engine.sim, { from: 0, to: clipped.frames })).toEqual(
      correctionEpisode(full, engine.sim, { from: 15, to: full.frames }),
    );
  } finally {
    engine.dispose();
  }
});

it('hands off twice without resetting time or state and resumes from the applied operator action', () => {
  const { engine, setup, policy } = session();
  const original = structuredClone(policy);

  try {
    engine.step(0.06);
    engine.startTeaching(setup);

    for (let i = 0; i < 2; i++) {
      const before = Float64Array.from(engine.data.qpos);
      const time = engine.data.time;

      engine.handoff('operator');
      engine.handoff('operator');
      expect(engine.data.time).toBe(time);
      expect(Float64Array.from(engine.data.qpos)).toEqual(before);
      engine.step(engine.dt);

      const measured = policy.joints.map(
        (id) => before[engine.jointAddresses()[engine.sim.joints.findIndex((j) => j.id === id)]],
      );

      expect(Array.from(engine.data.ctrl)).toEqual(measured.map((v) => expect.closeTo(v, 8)));
      engine.command({ v: [0, 0, 0], joints: Object.fromEntries(policy.joints.map((id) => [id, 20])) });
      engine.step(0.06);

      const last = Float64Array.from(engine.data.ctrl);

      engine.handoff('policy');
      engine.handoff('policy');
      engine.step(engine.dt);
      expect(Array.from(engine.data.ctrl)).toEqual(Array.from(last, (v) => expect.closeTo(v * 0.5 + 0.1, 6)));
    }

    expect(engine.data.time).toBeCloseTo(0.06 + 2 * (0.06 + 2 * engine.dt), 8);
    expect(policy).toEqual(original);
  } finally {
    engine.dispose();
  }
});

it('adopts the applied previous action when teaching starts under an existing fault', () => {
  const { engine, setup, controller } = session();

  try {
    engine.setFault(controller.policy.joints[0], 'stuck');
    engine.step(0.04);

    const previous = Float32Array.from(engine.data.ctrl);

    engine.startTeaching(setup);
    engine.handoff('operator');

    const recorder = new Recorder(engine, controller);

    engine.controlHook = recorder.control;
    engine.step(engine.dt);

    const recording = recorder.finish();

    expect(recording.actionPrevious).toEqual(previous);
    expect(previous[0]).toBe(0);
    expect(recording.faults).toEqual([{ at: 0, joint: controller.policy.joints[0], kind: 'stuck' }]);
  } finally {
    engine.dispose();
  }
});

it('retains post-fault controls and nonoverlapping owners at every physics boundary in a portable try', () => {
  const { engine, setup, controller } = session();

  try {
    engine.startTeaching(setup);

    const recorder = new Recorder(engine, controller);

    engine.stepHook = recorder.hook;
    engine.controlHook = recorder.control;
    engine.step(0.04);
    engine.handoff('operator');
    engine.setFault(controller.policy.joints[0], 'stuck');
    recorder.fault(controller.policy.joints[0], 'stuck');

    const held = engine.data.qpos[engine.jointAddresses()[0]];

    engine.command({ v: [0, 0, 0], joints: { [controller.policy.joints[0]]: 80 } });
    engine.step(0.04);
    engine.handoff('policy');
    engine.step(0.04);

    const recording = recorder.finish();
    const restored = decodeRecording(encodeRecording(recording));

    expect(restored).toEqual(recording);
    expect(recording.teaching?.boundaries).toBe(Math.round(0.12 / engine.dt));
    expect(recording.actionTime?.[0]).toBe(0);
    expect(recording.actionTime?.every((t, i, all) => !i || t > all[i - 1])).toBe(true);
    expect(Array.from(recording.actionOwner ?? [])).toEqual([
      ...Array<number>(Math.round(0.04 / engine.dt)).fill(0),
      ...Array<number>(Math.round(0.04 / engine.dt)).fill(1),
      ...Array<number>(Math.round(0.04 / engine.dt)).fill(0),
    ]);

    for (let i = Math.round(0.04 / engine.dt); i < recording.teaching!.boundaries; i++)
      expect(recording.actionCtrl![i * recording.nu]).toBeCloseTo(held, 6);

    expect(recording.faults).toHaveLength(1);
    expect(recording.t.at(-1)).toBeCloseTo(0.12, 6);
    expect(recording.contactOffsets).toHaveLength(recording.frames + 1);

    const corrections = correctionEpisode(recording, engine.sim, { from: 0, to: recording.frames });
    const at = Math.round(0.04 / engine.dt);
    const width = controller.policy.joints.length;

    expect(corrections.actions).toHaveLength(1);
    expect(corrections.actions[0][0]).toBeCloseTo(held, 6);
    expect(corrections.obs[0].slice(12 + 2 * width)).toEqual(
      Array.from(recording.actionPrevious!.subarray(at * width, (at + 1) * width)),
    );
    expect(() => correctionEpisode(recording, engine.sim, { from: 0, to: 2 })).toThrow();
    expect(() =>
      correctionEpisode(recording, { ...engine.sim, xml: `${engine.sim.xml}\n` }, { from: 0, to: 3 }),
    ).toThrow();
    expect(() => demoEpisode(recording, engine.sim, controller.policy)).toThrow();

    const clipped = sampleRecording(recording, { from: 2, to: recording.frames });

    expect(decodeRecording(encodeRecording(clipped))).toEqual(clipped);
    expect(correctionEpisode(clipped, engine.sim, { from: 0, to: clipped.frames })).toEqual(corrections);

    const damaged = [
      { ...recording, actionOwner: undefined },
      { ...recording, teaching: undefined },
      { ...recording, actionCtrl: recording.actionCtrl!.slice(1) },
      { ...recording, actionOwner: recording.actionOwner!.map(() => 3) },
      { ...recording, actionTime: recording.actionTime!.map(() => 0) },
      { ...recording, actionPrevious: recording.actionPrevious!.map(() => NaN) },
    ];

    damaged.forEach((value) => expect(decodeRecording(encodeRecording(value))).toBeNull());
  } finally {
    engine.dispose();
  }
});

it('refuses unsupported policies before mutating the running controller', () => {
  const { engine, setup, controller } = session();

  try {
    const policies = [
      { ...controller.policy, joints: controller.policy.joints.toReversed() },
      { ...controller.policy, clock: { frames: 10, loop: false } },
      { ...controller.policy, actionScale: 0 },
      { ...controller.policy, controlDt: engine.dt / 2 },
      { ...controller.policy, obsStd: [1] },
    ];

    for (const policy of policies) {
      engine.setController({ ...controller, policy });
      expect(() => engine.startTeaching(setup)).toThrow();
      expect(engine.teachingSource()).toBeNull();
    }

    engine.setController({ kind: 'hold' });
    expect(() => engine.startTeaching(setup)).toThrow();
    engine.setController(controller);
    expect(() => engine.startTeaching({ ...setup, kind: 'pose' } as unknown as ArmSetup)).toThrow();
    expect(engine.teachingSource()).toBeNull();
  } finally {
    engine.dispose();
  }
});
