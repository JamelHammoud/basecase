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

describe('dataset worker split assignments', () => {
  it('preserves each job episode split through sampling and export', async () => {
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
        source: { try: `try-${index}` },
        split,
      })),
    });

    for (const prefix of ['', 'v2.1/']) {
      const info = JSON.parse(strFromU8(files[`${prefix}meta/info.json`]));
      const source = JSON.parse(strFromU8(files[`${prefix}meta/basecase.json`]));

      expect(info.splits).toEqual({ train: '0:1', validation: '1:2', test: '2:3' });
      expect(source.episodes).toEqual(
        splits.map((split, episode_index) => ({ episode_index, try: `try-${episode_index}`, split })),
      );
    }
  });
});
