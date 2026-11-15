import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it, vi } from 'vitest';
import { encodeRecording } from '../cases/recordingFile';
import { caseRobot } from '../cases/testing';
import type { StoredTry } from '../cases/tryFile';
import { sha256 } from '../cases/tries';
import { datasetContentHash } from '../datasets/contentHash';
import type { DatasetSnapshot, FrozenTrySample } from '../datasets/snapshotTypes';
import { SimEngine } from '../sim/engine';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildMjcf } from '../sim/mjcf';
import { Recorder } from '../sim/recorder';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { prepareDataset } from './datasetJob';

const content = vi.hoisted(() => new Map<string, Uint8Array>());

vi.mock('../datasets/datasetStore/content', () => ({
  loadDatasetContent: async (hash: string) => content.get(hash) ?? null,
  saveDatasetContent: vi.fn(),
}));

async function fixture() {
  const mj = await loadMujoco();
  const arm = fixtureRobots().find((robot) => robot.id === 'arm-3dof')!;
  const model = buildMjcf({ ...caseRobot(arm), rig: buildRig(arm.joints, arm.parts), project: DEFAULT_PROJECT });
  const engine = new SimEngine(mj, model);
  const recorder = new Recorder(engine);

  engine.stepHook = recorder.hook;
  engine.step(0.3);

  const recording = recorder.finish();

  engine.dispose();

  const bytes = encodeRecording(recording);
  const hash = await datasetContentHash(bytes);
  const modelHash = await sha256(model.xml);
  const stored: StoredTry = {
    version: 1,
    id: 'try',
    sceneId: 'scene',
    robot: { name: 'Arm', modelHash, joints: ['j'] },
    case: { id: 'pick', name: 'Pick a block', hash: 'frozen-case' },
    source: 'case',
    input: null,
    startedAt: 'frozen-time',
    seconds: recording.frames * recording.dt,
    rate: 50,
    frames: recording.frames,
    outcome: { verdict: 'passed', margin: 0.5 },
    seed: 1,
    sourceTry: null,
    faults: [],
    labels: {
      by: 'person',
      instruction: 'Pick the red block',
      tags: [],
      flags: [],
      segments: [{ from: 2, to: 6, label: 'grasp', instruction: 'Close the gripper' }],
    },
  };
  const sample = (tryId: string, split: FrozenTrySample['split']): FrozenTrySample => ({
    tryId,
    from: 2,
    to: 6,
    recording: hash,
    source: `run:${tryId}`,
    split,
    stored: { ...stored, id: tryId },
    excluded: [],
  });
  const snapshot: DatasetSnapshot = {
    task: 'Frozen dataset task',
    modelHash,
    images: [],
    samples: [sample('test', 'test'), sample('train', 'train'), sample('validation', 'validation')],
  };

  content.set(hash, bytes);

  return { scene: { model, robotName: 'Arm', parts: arm.parts, world: [], guests: [] }, snapshot, recording };
}

describe('export jobs from frozen dataset samples', () => {
  it('restores exact ranges and labels without loading live tries and groups the fixed split assignments', async () => {
    const { scene, snapshot, recording } = await fixture();
    const load = vi.fn().mockRejectedValue(new Error('Live recording read'));
    const labels = vi.fn().mockRejectedValue(new Error('Live labels read'));
    const prepared = await prepareDataset({
      scene,
      snapshot,
      kase: null,
      name: 'Frozen',
      task: 'Edited task',
      records: [],
      load,
      labels,
    });

    expect(load).not.toHaveBeenCalled();
    expect(labels).not.toHaveBeenCalled();
    expect(prepared?.job.episodes.map((episode) => episode.split)).toEqual(['train', 'validation', 'test']);
    expect(prepared?.job.episodes.map((episode) => episode.source.try)).toEqual(['train', 'validation', 'test']);

    for (const episode of prepared!.job.episodes) {
      expect(episode.task).toBe('Close the gripper');
      expect(episode.segments).toEqual([{ from: 0, to: 4, text: 'Close the gripper' }]);
      expect(episode.recording.frames).toBe(4);
      expect(episode.recording.qpos).toEqual(recording.qpos.slice(2 * recording.nq, 6 * recording.nq));
      expect(episode.source).toMatchObject({
        at: 'frozen-time',
        margin: 0.5,
        case_hash: 'frozen-case',
        seed: 1,
        source: null,
        recording_hash: snapshot.samples[0].recording,
        from_frame: 2,
        to_frame: 6,
      });
    }
  });

  it('preserves whole-try instructions, exclusion counts and immutable model identity', async () => {
    const { scene, snapshot, recording } = await fixture();

    snapshot.samples = snapshot.samples.slice(0, 2).map((sample, index) => ({
      ...sample,
      from: 0,
      to: recording.frames,
      excluded: index ? ['quality:effort'] : [],
    }));

    const prepared = await prepareDataset({ scene, snapshot, kase: null, name: 'Frozen', task: 'Edited', records: [] });

    expect(prepared).toMatchObject({ used: 1, left: 1, modelHash: snapshot.modelHash });
    expect(prepared!.job.episodes[0].task).toBe('Pick the red block');
    await expect(
      prepareDataset({
        scene: { ...scene, model: { ...scene.model, xml: '<changed/>' } },
        snapshot,
        kase: null,
        name: 'Frozen',
        task: 'Edited',
        records: [],
      }),
    ).rejects.toThrow('The frozen dataset model changed.');
  });
});
