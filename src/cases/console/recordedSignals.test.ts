import { beforeAll, describe, expect, it } from 'vitest';
import type { DriveCommand } from '../../sim/driveTypes';
import { SimEngine } from '../../sim/engine';
import { fixtureMeasures, fixtureTriangles } from '../../sim/fixtures/parts';
import { fixtureRobots } from '../../sim/fixtures/robots';
import { loadMujoco } from '../../sim/loadMujoco';
import { buildMjcf } from '../../sim/mjcf';
import { recordedEfforts } from '../../sim/recordedFrames';
import { Recorder } from '../../sim/recorder';
import { DEFAULT_PROJECT } from '../../types/robotics';
import { buildRig } from '../../utils/kinematics';
import { toCommand } from '../caseDrives';
import type { GoalJudge } from '../goalJudge';
import { worldItem } from '../schema';
import { liveController, touchTheDots } from '../testing';
import { caseScoring, consoleTrack } from './consoleTrack';
import { DEFAULT_CONSOLE } from './layout';
import { frameJoints, lastProbes, liveRobot } from './liveSample';
import { goalMarks, recordedTrack } from './recordedSignals';
import { baseValues, createSignalBus, type SignalValue } from './signalBus';

const arm = fixtureRobots().find((r) => r.id === 'arm-3dof')!;
const rig = buildRig(arm.joints, arm.parts);
const kase = touchTheDots(arm);
const INPUTS = ['keys'];

async function liveTry() {
  const mj = await loadMujoco();
  const staged = caseScoring({ kase, model: null as never, rig, parts: arm.parts }).scoring.kase;
  const model = buildMjcf({
    parts: arm.parts,
    rig,
    project: DEFAULT_PROJECT,
    measures: fixtureMeasures(arm.parts),
    partTriangles: fixtureTriangles(arm.parts),
    world: staged.world.objects.map(worldItem),
  });
  const { reader, world } = caseScoring({ kase, model, rig, parts: arm.parts });
  const engine = new SimEngine(mj, model);
  const controller = liveController(arm, rig, model);

  engine.setController(controller);

  const recorder = new Recorder(engine, controller);
  const start = engine.data.time;
  const script = [...staged.reference.timeline].sort((a, b) => a.at - b.at);
  const live: Array<Map<string, SignalValue>> = [];
  let command: DriveCommand | null = null;

  const read = () => {
    const poses = engine.poses();

    live.push(
      baseValues({
        time: engine.data.time - start,
        running: true,
        joints: frameJoints(model, engine.jointStates()),
        robot: liveRobot(engine.stats().robots[0], world, poses),
        probes: lastProbes(reader, poses),
        inputs: { keys: command },
        goal: null,
        cameras: ['scene'],
      }),
    );
  };

  read();
  engine.stepHook = () => {
    const before = recorder.length;

    recorder.hook();

    if (recorder.length > before) read();
  };
  engine.commandHook = recorder.command;

  while (engine.data.time - start < 3) {
    while (script.length && script[0].at <= engine.data.time - start + 1e-9) {
      command = toCommand(script.shift()!);
      engine.command(command);
    }

    engine.step(1 / 60);
  }

  const recording = recorder.finish();
  const efforts = recordedEfforts(mj, new SimEngine(mj, model), recording);

  engine.dispose();

  return { model, recording, efforts, live, reader, world };
}

const counting = (): GoalJudge => {
  let seen = 0;

  return {
    judge: async (_dt, delta) => {
      seen += Object.values(delta)[0]?.length ?? 0;

      return { passed: seen > 60, margin: seen / 100, worstAt: 0, failed: seen > 30 ? ['too slow'] : [] };
    },
    dispose: () => {},
  };
};

let tried: Awaited<ReturnType<typeof liveTry>>;

beforeAll(async () => {
  tried = await liveTry();
});

describe('recorded signals', () => {
  it('replays a Touch a Point try with every signal equal to the live value at the same sim time', async () => {
    const { model, recording, efforts, live, reader, world } = tried;
    const track = await recordedTrack({
      recording,
      model,
      efforts,
      probes: { reader, world },
      inputs: INPUTS,
      cameras: ['scene'],
    });

    expect(live).toHaveLength(recording.frames);
    expect([...live[0].keys()].some((id) => id.startsWith('probe.'))).toBe(true);

    for (let n = 0; n < recording.frames; n += 7) {
      const shown = track.values(n);

      live[n].forEach((value, id) => {
        if (typeof value === 'number') expect(shown.get(id), `${id} at frame ${n}`).toBeCloseTo(value, 2);
        else expect(shown.get(id)).toEqual(value);
      });
    }

    expect(track.series('time').t).toHaveLength(recording.frames);
    expect(track.series(`joint.${model.joints[0].id}.effort`).v.some((v) => v !== 0)).toBe(true);
  });

  it('gives the same bus values for the same try and time', async () => {
    const { model, recording, efforts, reader, world } = tried;
    const build = () =>
      recordedTrack({ recording, model, efforts, probes: { reader, world }, inputs: INPUTS, cameras: ['scene'] });
    const [a, b] = await Promise.all([build(), build()]);
    const half = Math.floor(recording.frames / 2);
    const busOf = (track: typeof a) => {
      const bus = createSignalBus();

      bus.play(track);
      bus.seek(half);

      return Object.fromEntries(track.ids.map((id) => [id, bus.read(id)]));
    };

    expect(busOf(a)).toEqual(busOf(b));
    expect(busOf(a).time).toBeCloseTo(half * recording.dt, 6);
  });

  it('plays a try without a Case through the default console: joints, robot, inputs and time, no probes', async () => {
    const { model, recording, efforts } = tried;
    const track = await consoleTrack({
      kase: null,
      model,
      rig,
      parts: arm.parts,
      recording,
      efforts,
      caseConsole: DEFAULT_CONSOLE,
      cameras: ['scene'],
      judge: counting,
    });
    const values = track.values(10);

    expect(values.get(`joint.${model.joints[0].id}.position`)).toEqual(expect.any(Number));
    expect(values.has('input.gamepad.forward') && values.has('input.keys.turn')).toBe(true);
    expect(track.ids.some((id) => id.startsWith('probe.') || id.startsWith('goal.'))).toBe(false);
    expect(values.get('camera.scene')).toEqual(['scene']);
  });

  it('judges goal.* every half second of the try and shows each verdict from its frame on', async () => {
    const trace = { dt: 0.02, signals: { reach: Array.from({ length: 100 }, (_, i) => i) } };
    const marks = await goalMarks(counting(), trace);

    expect(marks.map((m) => m.frame)).toEqual([24, 49, 74, 99]);
    expect(marks.map((m) => m.failed.length)).toEqual([0, 1, 1, 1]);

    const { model, recording } = tried;
    const track = await recordedTrack({ recording, model, goal: marks, inputs: [], cameras: [] });

    expect(track.values(10).has('goal.passed')).toBe(false);
    expect(track.values(30).get('goal.failed')).toEqual([]);
    expect(track.values(60).get('goal.failed')).toEqual(['too slow']);
    expect(track.values(80).get('goal.passed')).toBe(1);
  });

  it('counts the Case’s own timer on the try’s clock', async () => {
    const { model, recording } = tried;
    const track = await recordedTrack({
      recording,
      model,
      inputs: [],
      cameras: [],
      signals: [{ id: 'clock', kind: 'timer', seconds: 10 }],
    });

    expect(track.values(0).get('clock')).toBe(10);
    expect(track.values(100).get('clock')).toBeCloseTo(10 - recording.t[100], 4);
  });
});
