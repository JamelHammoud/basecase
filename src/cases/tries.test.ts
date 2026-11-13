import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { driveAccess } from '../sim/driveAccess';
import { SimEngine } from '../sim/engine';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildMjcf } from '../sim/mjcf';
import { framePoses, Recorder, RECORD_HZ } from '../sim/recorder';
import { DEFAULT_PROJECT } from '../types/robotics';
import { sharedScene } from '../utils/sceneFile';
import { buildRig } from '../utils/kinematics';
import { filmFrames } from './filmstrip';
import { robotFacts } from './robotFit';
import { worldItem } from './schema';
import { caseRobot, presetCase, runCase, touchTheDots } from './testing';
import { scoreTry, tryManifest, worstFirst, type TryRecord } from './tries';

const robot = (id: string) => fixtureRobots().find((r) => r.id === id)!;

function liveTry(id: string) {
  const r = robot(id);
  const rig = buildRig(r.joints, r.parts);
  const kase = presetCase(r, 'reach-the-flag');
  const model = buildMjcf({
    ...caseRobot(r),
    rig,
    project: DEFAULT_PROJECT,
    world: kase.world.objects.map(worldItem),
  });

  return { r, rig, kase, model };
}

describe('recording a try', () => {
  it('records 50 Hz and replays to the same poses', async () => {
    const mj = await loadMujoco();
    const { r, rig, kase, model } = liveTry('rover-diff');
    const engine = new SimEngine(mj, model);
    const access = driveAccess({ rig, parts: r.parts, model });

    if (access.kind !== 'ready') throw new Error(`No scripted drive: ${access.kind}`);

    engine.setController({ kind: 'drive', setup: access.setup });

    const recorder = new Recorder(engine);

    engine.stepHook = recorder.hook;
    engine.command({ v: [1, 0, 0] });
    engine.step(2);

    const recording = recorder.finish();

    expect(recording.frames).toBeGreaterThanOrEqual(2 * RECORD_HZ);
    expect(recording.frames).toBeLessThanOrEqual(2 * RECORD_HZ + 1);
    expect(recording.qpos).toHaveLength(recording.frames * recording.nq);

    const replay = new SimEngine(mj, model);
    const at = recording.frames - 1;

    replay.setState(recording.qpos.subarray(at * recording.nq, (at + 1) * recording.nq));

    const stored = framePoses(recording, at);
    const again = replay.poses();

    stored.forEach((v, i) => expect(again[i]).toBeCloseTo(v, 4));

    const manifest = await tryManifest(kase, model, recording);

    expect(manifest.caseHash).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.frames).toBe(recording.frames);
    engine.dispose();
    replay.dispose();
  });

  it('scores a live try with the same contract as the headless run', async () => {
    const mj = await loadMujoco();
    const arm = robot('arm-3dof');
    const kase = touchTheDots(arm);
    const headless = await runCase(mj, kase, arm, { controller: 'reference' });
    const rig = buildRig(arm.joints, arm.parts);
    const engine = new SimEngine(mj, headless.model);
    const facts = robotFacts(rig, arm.parts);
    const access = driveAccess({ rig, parts: arm.parts, model: headless.model });

    if (access.kind !== 'ready') throw new Error(`No scripted drive: ${access.kind}`);

    engine.setController({ kind: 'drive', setup: access.setup });

    const recorder = new Recorder(engine);

    engine.stepHook = recorder.hook;

    const timeline = [...kase.reference.timeline];

    for (let t = 0; t < kase.task.seconds; t += 0.02) {
      while (timeline.length && timeline[0].at <= t + 1e-9)
        engine.command({ v: [0, 0, 0], target: timeline.shift()!.target });

      engine.step(0.02);
    }

    const scored = await scoreTry({
      kase,
      model: headless.model,
      recording: recorder.finish(),
      effector: facts.endEffector,
      rig,
    });

    expect(scored.passed).toBe(true);
    expect(scored.margin).toBeGreaterThan(0);
    engine.dispose();
  });

  it('a rover reaches the flag on its reference, and a limp one does not', async () => {
    const mj = await loadMujoco();
    const rover = robot('rover-diff');
    const kase = presetCase(rover, 'reach-the-flag');

    expect((await runCase(mj, kase, rover, { controller: 'reference' })).passed).toBe(true);
    expect((await runCase(mj, kase, rover, { controller: 'limp' })).passed).toBe(false);
    expect((await runCase(mj, kase, robot('arm-3dof'), { controller: 'reference' })).refusal).toMatch(/wheels/);
  });

  it('sorts tries worst first, and tries never travel in a .basecase file', () => {
    const t = (margin: number) => ({ margin }) as TryRecord;

    expect(worstFirst([t(0.4), t(-0.2), t(0.1)]).map((x) => x.margin)).toEqual([-0.2, 0.1, 0.4]);

    const scene = sharedScene({
      name: 'S',
      globalGoal: '',
      parts: [],
      project: { ...DEFAULT_PROJECT, cases: [touchTheDots(robot('arm-3dof'))], tries: [t(1)] },
    });

    expect(scene.project).not.toHaveProperty('tries');
    expect(scene.project?.cases).toHaveLength(1);
  });
});

describe('filmstrip', () => {
  it('projects robot and world boxes, and the robot moves between frames', async () => {
    const mj = await loadMujoco();
    const arm = robot('arm-3dof');
    const kase = touchTheDots(arm);
    const run = await runCase(mj, kase, arm, { controller: 'reference' });
    const qpos = new Float64Array(run.frames.length);
    const poses = new Float32Array(run.frames.flatMap((f) => [...f.poses]));
    const recording = {
      dt: 0.02,
      frames: run.frames.length,
      nq: 1,
      nv: 0,
      nu: 0,
      nbody: run.model.bodies.length,
      t: new Float32Array(run.frames.length),
      ctrl: new Float32Array(0),
      qpos,
      qvel: new Float32Array(0),
      poses,
    };
    const boxes = [
      ...arm.parts.map((p) => ({
        id: p.id,
        world: false,
        position: p.position,
        rotation: p.rotation,
        size: [p.dimensions.width, p.dimensions.height, p.dimensions.depth] as [number, number, number],
        color: '#888888',
      })),
      ...kase.world.objects.map((o) => ({ ...o, world: true })),
    ];
    const frames = filmFrames({ model: run.model, recording, boxes, frames: 4 });
    const tip = (k: number) => frames[k].polygons.find((_, i) => boxes[i].id === 'link2')!.points[0];

    expect(frames).toHaveLength(4);
    expect(frames[0].polygons).toHaveLength(boxes.length);
    expect(frames[0].polygons.every((p) => p.points.length >= 4)).toBe(true);
    expect(tip(0)).not.toEqual(tip(2));
  });
});
