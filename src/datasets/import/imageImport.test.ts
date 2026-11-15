import { describe, expect, it, vi } from 'vitest';
import { exportCoco } from '../../vision/cocoExport';
import type { FrameSet } from '../../vision/frameSet';
import type { TrainingFrame } from '../../vision/frameSet';
import type { Dataset } from '../datasetFile';
import { importHandlers } from './dataImportJobs';
import { keepImportedImages } from './keepImportedImages';

const stored = vi.hoisted(() => ({
  datasets: new Map<string, Dataset>(),
  frames: new Map<string, TrainingFrame>(),
  writes: 0,
}));

vi.mock('../datasetStore', () => ({
  loadDatasets: async () => [...stored.datasets.values()],
  saveDataset: async (dataset: Dataset) => {
    stored.datasets.set(dataset.id, dataset);
  },
}));
vi.mock('../../vision/frameSetStore', () => ({
  saveTrainingFrame: async (id: string, frame: TrainingFrame) => {
    stored.frames.set(`${id}:${frame.id}`, frame);
    stored.writes++;
  },
  finalizeFrameSet: async () => {},
}));

const fixture = (): FrameSet => ({
  version: 1,
  id: 'frames',
  name: 'Mugs',
  caseId: null,
  sceneId: null,
  seed: 0,
  classes: [{ id: 0, name: 'Mugs' }],
  createdAt: 'now',
  frames: [
    {
      id: 'frame',
      seed: 0,
      camera: 'import',
      width: 1,
      height: 1,
      annotations: [],
      jpeg: new Uint8Array([255, 216, 255, 217]),
      depth: new Float32Array(1),
      split: 'test',
    },
  ],
});

describe('image import through the recording import worker', () => {
  it('stores a labelled dataset without a robot and adds nothing on repeat import', async () => {
    const context = { caseId: 'case-1', sceneId: 'scene-1', objects: [{ id: 'mug-1', name: 'mug' }] };
    const run = importHandlers();
    const source = { kind: 'bytes' as const, name: 'Mugs', files: exportCoco(fixture()) };

    expect((await run.read(source))?.images?.classes).toEqual([{ id: 0, name: 'Mugs' }]);

    const first = await keepImportedImages(run, context);

    expect(first.added).toBe(true);
    expect(first.dataset.imageMembers?.[0].classes).toEqual(['mug']);
    expect(first.dataset.caseId).toBe('case-1');
    expect(stored.frames.size).toBe(1);
    expect([...stored.frames.values()][0].split).toBe('test');
    await run.read(source);

    const again = await keepImportedImages(run, context);

    expect(again.added).toBe(false);
    expect(again.dataset.id).toBe(first.dataset.id);
    expect(stored.datasets.size).toBe(1);
    expect(stored.writes).toBe(1);
  });
});
