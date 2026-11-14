import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_PROJECT } from '../../types/robotics';
import { buildRig } from '../../utils/kinematics';
import { SimEngine } from '../../sim/engine';
import { fixtureMeasures, fixtureTriangles } from '../../sim/fixtures/parts';
import { fixtureRobots } from '../../sim/fixtures/robots';
import { buildMjcf } from '../../sim/mjcf';
import { recordedEfforts } from '../../sim/recordedFrames';
import { framePoses, Recorder, type Recording } from '../../sim/recorder';
import { WorldMoves } from '../../sim/worldMoves';
import { stageCase, stagedEffectors } from '../caseCast';
import { toCommand } from '../caseDrives';
import { traceJudge } from '../goalJudge';
import { probeReader, type ProbeWorld } from '../probes';
import { worldItem, type WorldObject } from '../schema';
import { liveController, touchTheDots } from '../testing';
import { caseProbeReader, caseProbeWorld, trySignals } from '../tries';
import { tripFrames } from '../tripFrames';
import type { ConsoleSignal } from './format';
import { DEFAULT_CONSOLE } from './layout';
import { liveSample } from './liveSample';
import { frameAtTime, goalVerdicts, recordedBus, recordedTrack, type RecordedScene } from './recordedSignals';
import { createSignalBus, type SignalValue } from './signalBus';

const arm = fixtureRobots().find((r) => r.id === 'arm-3dof')!;
const rig = buildRig(arm.joints, arm.parts);

const GAME: ConsoleSignal[] = [
  { id: 'clock', kind: 'timer', seconds: 10 },
  { id: 'close', kind: 'counter', when: { signal: 'probe.dot0', below: 80 } },
  {
    id: 'score',
    kind: 'score',
    sum: [
      { signal: 'close', times: 10 },
      { signal: 'clock', times: 1 },
    ],
  },
];

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
}, 60000);

const modelFor = (world: WorldObject[]) =>
  buildMjcf({
    parts: arm.parts,
    rig,
    project: DEFAULT_PROJECT,
    measures: fixtureMeasures(arm.parts),
    partTriangles: fixtureTriangles(arm.parts),
    world: world.map(worldItem),
  });

function touchTry() {
  const kase = touchTheDots(arm);
  const staged = stageCase(kase, { rig, parts: arm.parts }, []);
  const model = modelFor(staged.kase.world.objects);
  const scoring = { kase: staged.kase, model, rig, ...stagedEffectors(staged, { rig, parts: arm.parts }) };
  const reader = caseProbeReader(scoring);
  const world = caseProbeWorld(scoring);
  const engine = new SimEngine(mj, model);
  const controller = liveController(arm, rig, model);

  engine.setController(controller);

  const recorder = new Recorder(engine, controller);
  const live = createSignalBus(GAME);
  const seen: Array<{ frame: number; values: Map<string, SignalValue | undefined> }> = [];
  const script = [...staged.kase.reference.timeline].sort((a, b) => a.at - b.at);

  const observe = (frame: number) => {
    live.push(
      liveSample({
        model,
        joints: engine.jointStates(),
        poses: engine.poses(),
        robot: engine.stats().robots[0],
        time: engine.data.time,
        running: true,
        world,
        reader,
        inputs: {},
        goal: null,
        cameras: [],
      }),
    );
    seen.push({ frame, values: new Map(LIVE_IDS(model).map((id) => [id, live.read(id)])) });
  };

  observe(0);
  engine.commandHook = recorder.command;
  engine.stepHook = () => {
    const before = recorder.length;

    recorder.hook();

    if (recorder.length > before && before % 5 === 0) observe(before);
  };

  while (engine.data.time < 4) {
    while (script.length && script[0].at <= engine.data.time + 1e-9) engine.command(toCommand(script.shift()!));

    engine.step(1 / 60);
  }

  const recording = recorder.finish();
  const efforts = recordedEfforts(mj, engine, recording);

  engine.dispose();

  return { scoring, recording, efforts, seen, model, world };
}

const LIVE_IDS = (model: { joints: Array<{ id: string }> }) => [
  'time',
  ...model.joints.flatMap((j) => ['target', 'position', 'effort'].map((f) => `joint.${j.id}.${f}`)),
  ...['height', 'tilt', 'speed', 'travelled', 'x', 'z'].map((f) => `robot.${f}`),
  'probe.dot0',
  'probe.dot1',
  'probe.dot2',
  'clock',
  'close',
  'score',
];

function sceneOf(opened: ReturnType<typeof touchTry>, extra: Partial<RecordedScene> = {}): RecordedScene {
  const { scoring, recording, efforts, model, world } = opened;

  return {
    model,
    recording,
    efforts: efforts.forces,
    world,
    trace: trySignals({ ...scoring, recording }),
    probes: scoring.kase.task.probes.map((p) => p.signal),
    trips: [],
    verdicts: [],
    ...extra,
  };
}

const CONSOLE = { inputs: ['keys'], signals: GAME, cameras: ['wrist_camera'] };

describe('a try played through its console', () => {
  it('gives every panel the value it read live at the same sim time, on a Touch a Point try', () => {
    const opened = touchTry();
    const bus = recordedBus(recordedTrack(sceneOf(opened), CONSOLE));

    expect(opened.seen.length).toBeGreaterThan(30);

    for (const { frame, values } of opened.seen) {
      bus.seek(frame);

      for (const [id, live] of values) {
        const recorded = bus.read(id);

        expect(typeof recorded, `${id} at frame ${frame}`).toBe('number');
        expect(recorded as number, `${id} at frame ${frame}`).toBeCloseTo(live as number, 3);
      }
    }

    expect(bus.read('camera.wrist_camera')).toEqual(['wrist_camera']);
    expect(bus.read('input.keys.forward')).toBe(0);
  }, 60000);

  it('names the contract’s failures from the frame each tripped, and judges every half second', async () => {
    const opened = touchTry();
    const scene = sceneOf(opened);
    const contract = opened.scoring.kase.task.contract;
    const moved = { atom: { expr: { signal: 'dot0' }, cmp: '<' as const, value: 100, scale: 10 } };
    const failing = {
      ...contract,
      failures: [{ label: 'moved', formula: { eventually: { window: 'whole' as const, state: moved } } }],
    };
    const trips = await tripFrames(failing, scene.trace!);
    const verdicts = await goalVerdicts(traceJudge(contract), scene.trace!);
    const bus = recordedBus(recordedTrack({ ...scene, trips, verdicts }, CONSOLE));

    expect(trips).toHaveLength(1);
    expect(verdicts.length).toBeGreaterThanOrEqual(7);
    expect(verdicts[0].frame).toBe(24);
    bus.seek(trips[0].frame - 1);
    expect(bus.read('goal.failed')).toEqual([]);
    bus.seek(trips[0].frame);
    expect(bus.read('goal.failed')).toEqual(['moved']);
    bus.seek(10);
    expect(bus.read('goal.margin')).toBeUndefined();
    bus.seek(verdicts[1].frame);
    expect(bus.read('goal.margin')).toBeCloseTo(verdicts[1].margin);
  }, 60000);

  it('gives the same values for the same try and time, and a whole-try series with a playhead', () => {
    const opened = touchTry();
    const one = recordedBus(recordedTrack(sceneOf(opened), CONSOLE));
    const two = recordedBus(recordedTrack(sceneOf(opened), CONSOLE));
    const half = frameAtTime(one.track, opened.recording.t[opened.recording.frames - 1] / 2);

    one.seek(half);
    two.seek(half);

    for (const id of LIVE_IDS(opened.model)) expect(one.read(id)).toBe(two.read(id));

    expect(one.series('probe.dot0').v).toHaveLength(opened.recording.frames);
    expect(one.playhead()).toEqual({ at: one.track.t[half], end: one.track.t.at(-1), frame: half });
    expect(one.expand('joint.*.position')).toHaveLength(opened.model.joints.length);
  }, 60000);
});

describe('a try whose Case isn’t in this scene', () => {
  it('plays through the default console with every joint, robot and input signal', () => {
    const opened = touchTry();
    const bare = sceneOf(opened, { world: null, trace: null, probes: [] });
    const bus = recordedBus(recordedTrack(bare, { inputs: DEFAULT_CONSOLE.input, cameras: [] }));

    bus.seek(opened.recording.frames - 1);
    expect(bus.expand('joint.*.position')).toHaveLength(opened.model.joints.length);
    expect(bus.read('robot.tilt')).toBe(0);
    expect(bus.read('input.gamepad.forward')).toBe(0);
    expect(bus.read('time')).toBeCloseTo(opened.recording.t[opened.recording.frames - 1]);
    expect(bus.expand('probe.*')).toEqual([]);
  }, 60000);
});

describe('a try with world changes', () => {
  it('reads each moved object where the try put it at that moment', () => {
    const target: WorldObject = {
      id: 'target',
      name: 'target',
      kind: 'box',
      position: [150, 1, 0],
      rotation: [0, 0, 0],
      size: [40, 2, 40],
      color: '#888888',
      behavior: 'marker',
      movable: true,
    };
    const model = modelFor([target]);
    const engine = new SimEngine(mj, model);
    const moves = new WorldMoves(mj, engine);
    const recorder = new Recorder(engine, null, moves);

    const change = { id: 'target', pose: { position: [150, 1, 300] as [number, number, number] } };

    engine.stepHook = recorder.hook;
    engine.step(1);
    moves.apply(change);
    recorder.worldChange(change);
    engine.step(1);

    const recording: Recording = recorder.finish();
    const world: ProbeWorld = {
      model,
      effector: null,
      basePart: null,
      basePoint: [0, 0, 0],
      objectAt: new Map([['target', target.position]]),
    };
    const reader = probeReader([{ signal: 'gap', from: { point: [150, 1, 0] }, to: { object: 'target' } }], world);
    const signals: Record<string, number[]> = {};

    for (let n = 0; n < recording.frames; n++) reader.sample(framePoses(recording, n), signals);

    const bus = recordedBus(
      recordedTrack(
        {
          model,
          recording,
          efforts: null,
          world,
          trace: { dt: recording.dt, signals },
          probes: ['gap'],
          trips: [],
          verdicts: [],
        },
        { inputs: [], cameras: [] },
      ),
    );

    engine.dispose();
    bus.seek(frameAtTime(bus.track, 0.5));
    expect(bus.read('probe.gap')).toBeCloseTo(0, 0);
    bus.seek(frameAtTime(bus.track, 1.5));
    expect(bus.read('probe.gap')).toBeCloseTo(300, 0);
  }, 60000);
});
