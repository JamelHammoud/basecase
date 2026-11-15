import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrainingImagesJob } from './trainingPlan';
import type { TrainingFrame } from './frameSet';

const state = vi.hoisted(() => ({
  calls: [] as string[],
  frames: [] as unknown[],
  errorAt: -1,
  next: 0,
  dispose: vi.fn(),
  saveFrame: vi.fn(),
  finalize: vi.fn(),
  saveDataset: vi.fn(),
  datasets: [] as unknown[],
}));

vi.mock('../utils/workerRpc', () => ({
  workerClient: () => ({
    call: async (op: string) => {
      state.calls.push(op);

      if (op === 'load')
        return {
          name: 'Mug',
          caseId: 'mug',
          sceneId: 'scene',
          seed: 7,
          classes: [{ id: 0, name: 'Mug', keypoints: [] }],
          count: state.frames.length,
        };

      if (state.next === state.errorAt) throw new Error('Render failed');

      return state.frames[state.next++];
    },
    dispose: state.dispose,
  }),
}));
vi.mock('../three/componentMeshes', () => ({ sourcedMeshFiles: async () => ({}) }));
vi.mock('../datasets/datasetStore', () => ({
  saveDataset: state.saveDataset,
  loadDatasets: async () => state.datasets,
}));
vi.mock('./frameSetStore', () => ({ saveTrainingFrame: state.saveFrame, finalizeFrameSet: state.finalize }));

import { makeTrainingImages } from './trainingImagesClient';
import { frameHash } from './frameSet';

const job = { parts: [], world: [], sceneId: 'scene', seed: 7 } as unknown as TrainingImagesJob;
const frame = (seed: number): TrainingFrame => ({
  id: '',
  seed,
  camera: 'scene',
  width: 1,
  height: 1,
  jpeg: new Uint8Array([255, 216, 255, 217]),
  depth: new Float32Array([500]),
  annotations: [
    {
      instance: 'mug',
      classId: 0,
      box: [0, 0, 1, 1],
      mask: { size: [1, 1], counts: [0, 1] },
      polygons: [[0, 0, 1, 0, 1, 1, 0, 1]],
      keypoints: [],
    },
  ],
});

beforeEach(async () => {
  vi.clearAllMocks();
  state.calls = [];
  state.next = 0;
  state.errorAt = -1;
  state.datasets = [];
  state.frames = await Promise.all(
    Array.from({ length: 20 }, async (_, seed) => {
      const made = frame(seed);

      return { ...made, id: await frameHash(made) };
    }),
  );
});

describe('streamed training image persistence', () => {
  it('stores each frame before asking for another and finalizes one content-addressed dataset', async () => {
    const progress = vi.fn();

    state.saveFrame.mockImplementation(async (_id, saved) => {
      expect(state.next).toBe(state.saveFrame.mock.calls.length);
      expect(saved.jpeg).toBeInstanceOf(Uint8Array);
    });

    const made = await makeTrainingImages(job, progress);

    expect(state.saveFrame).toHaveBeenCalledTimes(20);
    expect(state.finalize).toHaveBeenCalledOnce();
    expect(made.frameSet.frames).toHaveLength(20);
    expect(made.frameSet.frames[0]).not.toHaveProperty('jpeg');
    expect(made.frameSet.frames[0]).not.toHaveProperty('depth');
    expect(made.classCounts).toEqual({ Mug: 20 });
    expect(made.dataset.imageMembers?.[0].frameSetId).toBe(made.frameSet.id);
    expect(made.dataset.imageMembers?.[0].frameIds).toHaveLength(20);
    expect(progress).toHaveBeenLastCalledWith({ done: 20, total: 20 });
    expect(state.dispose).toHaveBeenCalledOnce();

    state.next = 0;
    state.saveFrame.mockImplementation(async () => {});
    state.datasets = [
      { ...made.dataset, name: 'Saved name', versions: [{ n: 3, hash: 'saved', at: '2026-11-14', members: [] }] },
    ];

    const repeated = await makeTrainingImages(job);

    expect(repeated.frameSet.id).toBe(made.frameSet.id);
    expect(repeated.dataset.name).toBe('Saved name');
    expect(repeated.dataset.versions[0].n).toBe(3);
    expect(state.saveDataset).toHaveBeenCalledTimes(1);
  });

  it('does not publish a partial set or dataset when a frame fails', async () => {
    state.errorAt = 3;

    await expect(makeTrainingImages(job)).rejects.toThrow('Render failed');
    expect(state.saveFrame).toHaveBeenCalledTimes(3);
    expect(state.finalize).not.toHaveBeenCalled();
    expect(state.saveDataset).not.toHaveBeenCalled();
    expect(state.dispose).toHaveBeenCalledOnce();
  });
});
