import { describe, expect, it } from 'vitest';
import { summaryOf, type StoredTry } from '../cases/tryFile';
import { newDataset } from '../datasets/datasetFile';
import { datasetVersionMembers, selectedDataset } from './datasetVersionView';

const stored: StoredTry = {
  version: 1,
  id: 'try-a',
  sceneId: 'scene-a',
  robot: { name: 'Arm', modelHash: 'old-model', joints: ['joint'] },
  case: null,
  source: 'import',
  input: null,
  startedAt: '2026-11-01T00:00:00Z',
  seconds: 1,
  rate: 10,
  frames: 10,
  outcome: { verdict: 'passed', margin: 1 },
  seed: 1,
  sourceTry: null,
  faults: [],
  task: 'Pick the block',
};

const dataset = () => ({
  ...newDataset({ id: 'data', name: 'Blocks', task: 'New task', members: ['try-b'], at: stored.startedAt }),
  versions: [
    {
      n: 1,
      hash: '1'.repeat(64),
      at: stored.startedAt,
      members: ['try-a'],
      snapshot: {
        task: 'Original task',
        modelHash: 'old-model',
        samples: [
          {
            tryId: 'try-a',
            from: 2,
            to: 5,
            recording: '2'.repeat(64),
            source: 'try-a',
            split: 'train' as const,
            stored,
            excluded: [],
          },
          {
            tryId: 'try-a',
            from: 7,
            to: 9,
            recording: '2'.repeat(64),
            source: 'try-a',
            split: 'train' as const,
            stored,
            excluded: [],
          },
        ],
        images: [],
      },
    },
  ],
});

describe('dataset version view', () => {
  it('keeps the working dataset separate from the chosen frozen version', () => {
    const working = dataset();
    const frozen = selectedDataset(working, 1)!;

    expect(frozen).toMatchObject({ selectedVersion: 1, task: 'Original task', members: ['try-a'] });
    expect(working).toMatchObject({ task: 'New task', members: ['try-b'] });
    expect(selectedDataset(working, null)).toBe(working);
    expect(selectedDataset(working, 8)).toBe(working);
    expect(selectedDataset(null, 1)).toBeNull();
  });

  it('shows frozen metadata and selected frame totals even after the live try changes or disappears', () => {
    const frozen = selectedDataset(dataset(), 1)!;
    const live = summaryOf(
      { ...stored, robot: { ...stored.robot, name: 'Changed arm' } },
      { recording: true, strip: true },
    );
    const members = datasetVersionMembers(frozen, [live]);

    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({
      robot: 'Arm',
      modelHash: 'old-model',
      frames: 5,
      seconds: 0.5,
      recording: false,
    });
    expect(datasetVersionMembers(frozen, [])).toEqual(members);
    expect(datasetVersionMembers(dataset(), [live])).toEqual([]);
  });
});
