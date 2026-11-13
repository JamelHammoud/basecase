import loadMujoco from '@mujoco/mujoco';
import { parquetReadObjects } from 'hyparquet';
import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { describe, expect, it } from 'vitest';
import { caseRobot } from '../cases/testing';
import { SimEngine } from '../sim/engine';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildMjcf } from '../sim/mjcf';
import { Recorder, RECORD_HZ, type Recording } from '../sim/recorder';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { zipDataset } from './zipDataset';
import { canExport, columnStats, DATASET_FPS, episodeData, robotJoints, sampledFrames } from './episodes';
import { dataPath, lerobotFiles, TASK_ANNOTATION, videoPath, type DatasetEpisode } from './lerobot';

const TASK = 'Touch the point with the end effector.';

async function armTry() {
  const mj = await loadMujoco();
  const arm = fixtureRobots().find((r) => r.id === 'arm-3dof')!;
  const rig = buildRig(arm.joints, arm.parts);
  const model = buildMjcf({ ...caseRobot(arm), rig, project: DEFAULT_PROJECT });
  const engine = new SimEngine(mj, model);
  const recorder = new Recorder(engine);

  engine.stepHook = recorder.hook;
  engine.step(1);

  const recording = recorder.finish();

  engine.dispose();

  return { mj, model, recording };
}

const fakeVideo = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]);
const imageStats = columnStats([0.1, 0.2, 0.3, 0.5, 0.6, 0.7], 3);

const asEpisode = (data: ReturnType<typeof episodeData>, n: number): DatasetEpisode => ({
  ...data,
  videos: { scene: fakeVideo },
  imageStats: { scene: imageStats },
  source: { try: `try-${n}` },
});

const text = (files: Record<string, Uint8Array>, path: string) => strFromU8(files[path]);
const lines = (files: Record<string, Uint8Array>, path: string) =>
  text(files, path)
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as Record<string, unknown>);

describe('LeRobot datasets from tries', () => {
  it('samples a 50 Hz try at the dataset rate', () => {
    expect(sampledFrames({ frames: 101, dt: 1 / RECORD_HZ })).toHaveLength(51);
    expect(sampledFrames({ frames: 101, dt: 1 / RECORD_HZ })[1]).toBe(RECORD_HZ / DATASET_FPS);
  });

  it('reads joint state and commands from the recorded slots', async () => {
    const { mj, model, recording } = await armTry();
    const joints = robotJoints(model);
    const data = episodeData(recording, model, TASK);
    const width = joints.length;
    const replay = new SimEngine(mj, model);
    const row = data.frames.length - 1;
    const frame = data.frames[row];

    expect(canExport(recording, model)).toBe(true);
    expect(width).toBe(3);
    expect(data.state).toHaveLength(data.frames.length * width);
    replay.setState(recording.qpos.subarray(frame * recording.nq, (frame + 1) * recording.nq));
    joints.forEach((j, col) => {
      const id = mj.mj_name2id(replay.model, mj.mjtObj.mjOBJ_JOINT.value, j.name);

      expect(data.state[row * width + col]).toBeCloseTo(replay.data.qpos[replay.model.jnt_qposadr[id]], 5);
      expect(data.action[row * width + col]).toBeCloseTo(recording.ctrl[frame * recording.nu + j.actuator], 6);
    });
    replay.dispose();
  });

  it('refuses tries recorded before joint slots were stored', async () => {
    const { model, recording } = await armTry();
    const old: Recording = { ...recording, jointQpos: undefined };

    expect(canExport(old, model)).toBe(false);
  });

  it('writes parquet, videos and metadata GR00T reads', async () => {
    const { model, recording } = await armTry();
    const names = robotJoints(model).map((j) => j.name);
    const first = episodeData(recording, model, TASK);
    const second = episodeData(recording, model, 'Reach the spot.');
    const files = lerobotFiles({
      robotType: 'arm',
      jointNames: names,
      videos: [{ key: 'scene', width: 640, height: 480, codec: 'h264' }],
      episodes: [asEpisode(first, 0), asEpisode(second, 1)],
      source: { case: 'touch' },
    });
    const rows = await parquetReadObjects({ file: files[dataPath(1)].slice().buffer });
    const info = JSON.parse(text(files, 'meta/info.json'));
    const modality = JSON.parse(text(files, 'meta/modality.json'));
    const last = rows[rows.length - 1];

    expect(Object.keys(files)).toEqual(expect.arrayContaining([dataPath(0), videoPath(1, 'scene')]));
    expect(rows).toHaveLength(second.frames.length);
    expect(rows[0]['observation.state']).toHaveLength(names.length);
    expect(Number(rows[0].index)).toBe(first.frames.length);
    expect(Number(rows[0].episode_index)).toBe(1);
    expect(Number(rows[0][TASK_ANNOTATION])).toBe(1);
    expect(last['next.done']).toBe(true);
    expect(last['next.reward']).toBe(1);
    expect(rows[0]['next.done']).toBe(false);
    expect(info).toMatchObject({ codebase_version: 'v2.1', fps: DATASET_FPS, total_episodes: 2, total_tasks: 2 });
    expect(info.total_frames).toBe(first.frames.length + second.frames.length);
    expect(info.features['observation.images.scene'].shape).toEqual([480, 640, 3]);
    expect(info.features.action.names).toEqual(names);
    expect(modality.state.joints).toEqual({ start: 0, end: names.length });
    expect(modality.video.scene.original_key).toBe('observation.images.scene');
    expect(modality.annotation).toEqual({ 'human.task_description': {} });
    expect(lines(files, 'meta/tasks.jsonl')).toEqual([
      { task_index: 0, task: TASK },
      { task_index: 1, task: 'Reach the spot.' },
    ]);
    expect(lines(files, 'meta/episodes.jsonl')[1]).toEqual({
      episode_index: 1,
      tasks: ['Reach the spot.'],
      length: second.frames.length,
    });
    expect(lines(files, 'meta/episodes_stats.jsonl')[0].stats).toMatchObject({
      'observation.images.scene': { mean: [[[0.3]], [[0.4]], [[0.5]]] },
    });
  });

  it('zips under one folder, keeping media uncompressed', () => {
    const zip = zipDataset('touch-dataset', { 'meta/info.json': new Uint8Array([123, 125]), 'a.mp4': fakeVideo });
    const back = unzipSync(zip);

    expect(Object.keys(back).sort()).toEqual(['touch-dataset/a.mp4', 'touch-dataset/meta/info.json']);
    expect(back['touch-dataset/a.mp4']).toEqual(fakeVideo);
  });
});
