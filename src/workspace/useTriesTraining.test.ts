import loadMujoco from '@mujoco/mujoco';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeRecording } from '../cases/recordingFile';
import { caseRobot, touchTheDots } from '../cases/testing';
import { summaryOf, type StoredTry } from '../cases/tryFile';
import { sha256 } from '../cases/tries';
import { datasetContentHash } from '../datasets/contentHash';
import { newDataset, type Dataset } from '../datasets/datasetFile';
import { snapshotHash } from '../datasets/datasetSnapshot';
import { demoEpisode } from '../datasets/demos';
import type { DatasetSnapshot, FrozenTrySample } from '../datasets/snapshotTypes';
import { SimEngine } from '../sim/engine';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildMjcf } from '../sim/mjcf';
import type { PolicySpec } from '../sim/policy';
import { Recorder } from '../sim/recorder';
import type { TriesPlan } from '../skills/triesRun';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { prepareDataset } from './datasetJob';
import { useDatasetRecords } from './useDatasetRecords';
import { useTriesTraining, type TriesTraining } from './useTriesTraining';

const state = vi.hoisted(() => ({
  content: new Map<string, Uint8Array>(),
  live: [] as unknown[],
  manifests: vi.fn(),
  recordings: vi.fn(),
  save: vi.fn(),
  learn: vi.fn<(plan: TriesPlan) => string | null>(),
  showToast: vi.fn(),
}));

vi.mock('../datasets/datasetStore/content', () => ({
  loadDatasetContent: async (hash: string) => state.content.get(hash) ?? null,
  saveDatasetContent: state.save,
}));
vi.mock('../cases/tryStore', () => ({
  useTries: () => state.live,
  loadManifests: state.manifests,
  loadRecordingBytes: state.recordings,
}));

async function fixture() {
  const mj = await loadMujoco();
  const arm = fixtureRobots().find((robot) => robot.id === 'arm-3dof')!;
  const robot = caseRobot(arm);
  const project = { ...DEFAULT_PROJECT, joints: arm.joints };
  const model = buildMjcf({ ...robot, rig: buildRig(arm.joints, arm.parts), project });
  const engine = new SimEngine(mj, model);
  const recorder = new Recorder(engine);

  engine.stepHook = recorder.hook;
  engine.step(0.4);

  const recording = recorder.finish();

  engine.dispose();
  recording.ctrl = recording.ctrl.map((_, index) => 0.02 * (1 + Math.floor(index / recording.nu)));

  const bytes = encodeRecording(recording);
  const hash = await datasetContentHash(bytes);
  const modelHash = await sha256(model.xml);
  const stored: StoredTry = {
    version: 1,
    id: 'try',
    sceneId: 'scene',
    robot: { name: 'Arm', modelHash, joints: model.robots[0].joints },
    case: { id: 'touch', name: 'Touch', hash: 'frozen-case' },
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
    labels: { by: 'person', instruction: 'Frozen instruction', tags: [], flags: [], segments: [] },
  };
  const assignments: FrozenTrySample['split'][] = ['test', 'train', 'validation', 'train', 'train', 'test', 'train'];
  const samples = assignments.map((split, index): FrozenTrySample => ({
    tryId: `try-${index}`,
    from: index,
    to: index + 6,
    recording: hash,
    source: `run:${index}`,
    split,
    stored: {
      ...stored,
      id: `try-${index}`,
      labels: { ...stored.labels!, flags: index > 4 ? [{ at: index, kind: 'effort' }] : [] },
    },
    excluded: index > 4 ? ['quality:effort'] : [],
  }));
  const snapshot: DatasetSnapshot = { task: 'Frozen task', modelHash, samples, images: [] };
  const version = {
    n: 1,
    hash: await snapshotHash(snapshot),
    at: 'saved',
    members: samples.map((sample) => sample.tryId),
    snapshot,
  };
  const dataset: Dataset = {
    ...newDataset({ id: 'training', name: 'Training', task: 'Edited working task', members: ['live-only'], at: 'now' }),
    selectedVersion: 1,
    versions: [version, { ...version, n: 2, hash: 'b'.repeat(64), snapshot: { ...snapshot, samples: [] } }],
  };

  state.content.set(hash, bytes);

  return {
    dataset,
    snapshot,
    model,
    kase: touchTheDots(arm),
    robot: { ...robot, project },
    scene: { model, robotName: 'Arm', parts: arm.parts, world: [], guests: [] },
  };
}

function trainer(input: Awaited<ReturnType<typeof fixture>>): TriesTraining {
  const result: { current?: TriesTraining } = {};

  function Harness() {
    const records = useDatasetRecords([]);

    result.current = useTriesTraining({
      sim: { buildModel: async () => input.model, worldParts: [], guestParts: [] } as unknown as Parameters<
        typeof useTriesTraining
      >[0]['sim'],
      cases: [input.kase],
      records,
      skills: {
        runtime: { learnFromTries: state.learn } as unknown as Parameters<
          typeof useTriesTraining
        >[0]['skills']['runtime'],
        busy: false,
      },
      caseRobot: async () => input.robot,
      showToast: state.showToast,
    });

    return null;
  }

  renderToString(createElement(Harness));

  return result.current!;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.content.clear();
  state.live = [];
  state.learn.mockReturnValue(null);
  state.manifests.mockRejectedValue(new Error('Live labels read'));
  state.recordings.mockRejectedValue(new Error('Live recording read'));
  state.save.mockRejectedValue(new Error('Frozen content rewritten'));
});

describe('training a saved dataset version', () => {
  it('shares export ranges, exclusions and assignments after live labels and the working dataset change', async () => {
    const input = await fixture();

    state.live = input.snapshot.samples.map((sample) =>
      summaryOf(
        {
          ...sample.stored,
          split: 'test',
          labels: {
            ...sample.stored.labels!,
            instruction: 'Edited live instruction',
            flags: [{ at: 0, kind: 'effort' }],
          },
        },
        { recording: true, strip: false },
      ),
    );
    trainer(input).train(input.dataset, input.kase);
    await vi.waitFor(() => expect(state.learn).toHaveBeenCalledOnce());

    const plan = state.learn.mock.calls[0][0];
    const prepared = await prepareDataset({
      scene: input.scene,
      snapshot: input.snapshot,
      kase: input.kase,
      name: 'Saved',
      task: 'Edited',
      records: [],
    });
    const spec = plan.job.job as unknown as PolicySpec;
    const episodes = prepared!.job.episodes.map((episode) => ({
      ...demoEpisode(episode.recording, input.model, spec),
      split: episode.split,
    }));

    expect(prepared).toMatchObject({ used: 5, left: 2 });
    expect(episodes.map((episode) => episode.split)).toEqual(['train', 'train', 'train', 'validation', 'test']);
    expect(plan.job.job.demos).toEqual({ episodes });
    expect(prepared!.job.episodes.map((episode) => episode.source.try)).toEqual([
      'try-1',
      'try-3',
      'try-4',
      'try-2',
      'try-0',
    ]);
    expect(prepared!.job.episodes.every((episode) => episode.recording.frames === 6)).toBe(true);
    expect(prepared!.job.episodes.every((episode) => episode.task === 'Frozen instruction')).toBe(true);
    expect(state.manifests).not.toHaveBeenCalled();
    expect(state.recordings).not.toHaveBeenCalled();
    expect(state.save).not.toHaveBeenCalled();
    expect(state.showToast).not.toHaveBeenCalled();
  });

  it('refuses saved samples when the current robot no longer matches the frozen model', async () => {
    const input = await fixture();

    input.model = { ...input.model, xml: '<changed/>' };
    trainer(input).train(input.dataset, input.kase);
    await vi.waitFor(() =>
      expect(state.showToast).toHaveBeenCalledWith('These saved samples don’t fit this robot.', { tone: 'error' }),
    );
    expect(state.learn).not.toHaveBeenCalled();
  });
});
