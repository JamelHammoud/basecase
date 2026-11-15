import loadMujoco from '@mujoco/mujoco';
import { strFromU8 } from 'three/examples/jsm/libs/fflate.module.js';
import { describe, expect, it, vi } from 'vitest';
import { caseRobot } from '../cases/testing';
import { SimEngine } from '../sim/engine';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildMjcf } from '../sim/mjcf';
import { Recorder } from '../sim/recorder';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { buildDataset, type DatasetJobEpisode } from './buildDataset';

vi.mock('./renderVideos', () => ({
  videoCodec: vi.fn().mockResolvedValue('avc'),
  createRenderStage: vi.fn().mockResolvedValue({}),
  renderEpisode: vi.fn().mockResolvedValue({ videos: {}, imageStats: {} }),
  disposeRenderStage: vi.fn(),
}));

describe('dataset worker exports', () => {
  it('preserves episode splits, seeds and source tries through sampling and export', async () => {
    const mj = await loadMujoco();
    const robot = fixtureRobots().find((candidate) => candidate.id === 'arm-3dof')!;
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
      robotType: 'arm',
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
      expect(source.episodes).toEqual([
        { episode_index: 0, try: 'try-0', seed: 0, source: null, split: 'train' },
        { episode_index: 1, try: 'try-1', seed: 7, source: 'try-0', split: 'validation' },
        { episode_index: 2, try: 'try-2', seed: 8, source: 'try-0', split: 'test' },
      ]);
    }
  });
});
