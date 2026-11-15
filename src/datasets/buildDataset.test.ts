import loadMujoco from '@mujoco/mujoco';
import { parquetReadObjects } from 'hyparquet';
import { strFromU8 } from 'three/examples/jsm/libs/fflate.module.js';
import { describe, expect, it, vi } from 'vitest';
import { caseRobot } from '../cases/testing';
import { SimEngine } from '../sim/engine';
import { withLidar } from '../sim/fixtures/parts';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildMjcf } from '../sim/mjcf';
import { Recorder } from '../sim/recorder';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { buildDataset, type DatasetJobEpisode } from './buildDataset';
import { sampledFrames } from './episodes';
import { dataPath } from './lerobot';
import { SCAN_KEY } from './lerobotRows';
import { v3DataPath } from './lerobotV3';

vi.mock('./renderVideos', () => ({
  videoCodec: vi.fn().mockResolvedValue('avc'),
  createRenderStage: vi.fn().mockResolvedValue({}),
  renderEpisode: vi.fn().mockResolvedValue({ videos: {}, imageStats: {} }),
  disposeRenderStage: vi.fn(),
}));

describe('dataset worker exports', () => {
  it('preserves episode splits, seeds, source tries and LiDAR scans through sampling and export', async () => {
    const mj = await loadMujoco();
    const robot = withLidar(
      fixtureRobots().find((candidate) => candidate.id === 'rover-diff')!,
      'slamtec-rplidar-s2',
    );
    const rig = buildRig(robot.joints, robot.parts);
    const model = buildMjcf({ ...caseRobot(robot), rig, project: DEFAULT_PROJECT });
    const engine = new SimEngine(mj, model);
    const recorder = new Recorder(engine);

    engine.stepHook = recorder.hook;
    engine.step(0.2);

    const recording = recorder.finish();

    engine.dispose();

    const splits: DatasetJobEpisode['split'][] = ['train', 'validation', 'test'];
    const files = await buildDataset({
      name: 'Frozen tries',
      robotType: 'rover',
      parts: robot.parts,
      world: [],
      model,
      cameras: [],
      source: {},
      episodes: splits.map((split, index) => ({
        recording,
        task: 'Reach the point.',
        source: { try: `try-${index}`, seed: [0, 7, 8][index], source: index === 0 ? null : 'try-0' },
        split,
      })),
    });

    for (const prefix of ['', 'v2.1/']) {
      const info = JSON.parse(strFromU8(files[`${prefix}meta/info.json`]));
      const source = JSON.parse(strFromU8(files[`${prefix}meta/basecase.json`]));

      expect(info.splits).toEqual({ train: '0:1', validation: '1:2', test: '2:3' });
      expect(info.total_episodes).toBe(3);
      expect(info.features[SCAN_KEY].shape).toEqual([720]);
      expect(source.scans).toEqual([
        { part: 'lidar', name: 'Slamtec RPLIDAR S2', rays: 720, rangeM: 30, rateHz: 10, fovDeg: 360 },
      ]);
      expect(source.episodes).toEqual([
        { episode_index: 0, try: 'try-0', seed: 0, source: null, split: 'train' },
        { episode_index: 1, try: 'try-1', seed: 7, source: 'try-0', split: 'validation' },
        { episode_index: 2, try: 'try-2', seed: 8, source: 'try-0', split: 'test' },
      ]);
    }

    const frames = sampledFrames(recording);
    const scans = frames.map((frame) => Array.from(recording.scan!.subarray(frame * 720, (frame + 1) * 720)));
    const paths = [v3DataPath(0), ...splits.map((_, index) => `v2.1/${dataPath(index)}`)];

    expect(recording.scanWidth).toBe(720);

    for (const path of paths) {
      const rows = await parquetReadObjects({ file: files[path].slice().buffer });

      expect(rows.map((row) => row[SCAN_KEY])).toEqual(path === v3DataPath(0) ? scans.concat(scans, scans) : scans);
    }

    const modality = JSON.parse(strFromU8(files['v2.1/meta/modality.json']));

    expect(modality.state.scan).toEqual({ start: 0, end: 720, original_key: SCAN_KEY });
  });
});
